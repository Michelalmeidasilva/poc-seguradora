#!/usr/bin/env bash
# Local, per-service deploy of the POC to Cloud Run (Plan 8). Run from anywhere:
#   bash infra/deploy.sh help          (or: pnpm infra:deploy help)
# Terraform owns the shape of the platform (services, env, scaling, IAM); this script owns the
# container IMAGE of each Cloud Run service: `build` pushes an image, `deploy <service>` points
# that one service at it with `gcloud run services update --image` (never `gcloud run deploy`,
# never Terraform), so deploying one service never touches another. Infrastructure changes go
# through `infra plan|apply`, which always applies a saved plan kept in a private temp dir.
# Configuration comes only from infra/.env (see infra/.env.example) or --env-file; it reaches
# Terraform only as the TF_VAR_* variables exported by export_tf_vars. Enforced: other inherited
# TF_VAR_* are unset, and refuse_tf_overrides stops every Terraform command (exit 3) when an
# auto-loaded variable file (terraform.tfvars[.json], *.auto.tfvars[.json]) exists in
# infra/terraform or TF_WORKSPACE / TF_CLI_ARGS* are inherited.
# Offline tests: infra/deploy.test.sh (fake gcloud/docker/terraform/git/node).
# Written for bash 3.2 (macOS /bin/bash): no mapfile, associative arrays, ${var,,} or eval, and
# no bare "${arr[@]}" of a possibly empty array under `set -u`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
TF_STATE_PREFIX="seguradora"
SMOKE_SCRIPT="$ROOT/infra/smoke.mjs"
FAKE_DOCKERFILE="infra/fake-services/Dockerfile"

# --- service table: the single registry of deployable services ---------------------------------
# Index i describes one service: name (also the image name), Dockerfile (build context is always
# the repo root), Cloud Run service name, deploy order rank (leaf services first) and description.
SERVICE_NAMES=(svc-cotacao svc-apolice svc-sinistro chatbot gateway web)
SERVICE_DOCKERFILES=(apps/svc-cotacao/Dockerfile apps/svc-apolice/Dockerfile apps/svc-sinistro/Dockerfile
  apps/chatbot/Dockerfile apps/gateway/Dockerfile apps/web/Dockerfile)
SERVICE_RUN_NAMES=(svc-cotacao svc-apolice svc-sinistro chatbot gateway web)
SERVICE_RANKS=(1 2 3 4 5 6)
SERVICE_DESCRIPTIONS=(
  "serviço interno de cotação (interno; sem Dockerfile próprio usa a imagem FAKE)"
  "serviço interno de apólice (interno; sem Dockerfile próprio usa a imagem FAKE)"
  "serviço interno de sinistro (interno; sem Dockerfile próprio usa a imagem FAKE)"
  "motor de conversa (interno; chama os svc-*)"
  "API pública de sessão/eventos (chama o chatbot)"
  "frontend público (nginx + SPA; encaminha /v1 ao gateway)"
)
# Key order of the service_scaling JSON (Terraform variable); keys use underscores.
SCALING_ORDER="web gateway chatbot svc-cotacao svc-apolice svc-sinistro"

EXIT_OK=0
EXIT_USAGE=2
EXIT_PRECONDITION=3
EXIT_ABORTED=4
EXIT_SMOKE=5

# --- output helpers ------------------------------------------------------------------------------
info() { printf '%s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
die() { # die <exit code> <message>
  local code="$1"
  shift
  printf 'ERRO: %s\n' "$*" >&2
  exit "$code"
}
matches() { [[ "$1" =~ $2 ]]; } # matches <value> <extended regex>
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

# --- cleanup: private plan dir, interrupted deploys -----------------------------------------------
PLAN_DIR=""
UPDATED_SERVICES=""
cleanup() {
  if [ -n "$PLAN_DIR" ] && [ -d "$PLAN_DIR" ]; then rm -rf "$PLAN_DIR"; fi
  PLAN_DIR=""
}
on_signal() { # on_signal <exit code>
  cleanup
  if [ -n "$UPDATED_SERVICES" ]; then
    printf 'ERRO: interrompido. Já atualizados:%s\n' "$UPDATED_SERVICES" >&2
  else
    printf 'ERRO: interrompido.\n' >&2
  fi
  trap - EXIT
  exit "$1"
}
trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

# --- service table helpers -----------------------------------------------------------------------
service_index() { # prints the table index of <service>; fails when unknown
  local i=0
  while [ "$i" -lt "${#SERVICE_NAMES[@]}" ]; do
    if [ "${SERVICE_NAMES[$i]}" = "$1" ]; then
      printf '%s' "$i"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}
valid_services() { printf '%s ' "${SERVICE_NAMES[@]}"; }
run_name_for() { printf '%s' "${SERVICE_RUN_NAMES[$(service_index "$1")]}"; }
is_fake() { # true when <service> is a svc-* without its own Dockerfile (fake fallback)
  local df="${SERVICE_DOCKERFILES[$(service_index "$1")]}"
  case "$1" in svc-*) [ ! -f "$ROOT/$df" ] ;; *) return 1 ;; esac
}
dockerfile_for() { # repo-relative Dockerfile of <service>, with the fake fallback for svc-*
  local df="${SERVICE_DOCKERFILES[$(service_index "$1")]}"
  if [ -f "$ROOT/$df" ]; then
    printf '%s' "$df"
  elif is_fake "$1"; then
    printf '%s' "$FAKE_DOCKERFILE"
  else
    die "$EXIT_PRECONDITION" "Dockerfile de $1 não encontrado: $df"
  fi
}
warn_fake() { # loud warning, on every build/deploy of a service that uses the fake image
  if is_fake "$1"; then
    warn "imagem FAKE para $1: ${SERVICE_DOCKERFILES[$(service_index "$1")]} não existe; usando $FAKE_DOCKERFILE (fake dos contratos internos). O serviço real entra quando esse Dockerfile existir."
  fi
}
image_ref() { # image_ref <service> <tag>
  printf '%s-docker.pkg.dev/%s/%s/%s:%s' "$CFG_REGION" "$CFG_PROJECT_ID" "$CFG_ARTIFACT_REGISTRY_REPO" "$1" "$2"
}
sort_services() { # prints the given services (deduplicated) in deploy order (rank)
  local rank=1 i
  while [ "$rank" -le "${#SERVICE_NAMES[@]}" ]; do
    i=0
    while [ "$i" -lt "${#SERVICE_NAMES[@]}" ]; do
      if [ "${SERVICE_RANKS[$i]}" = "$rank" ]; then
        case " $* " in *" ${SERVICE_NAMES[$i]} "*) printf '%s ' "${SERVICE_NAMES[$i]}" ;; esac
      fi
      i=$((i + 1))
    done
    rank=$((rank + 1))
  done
}

# --- help (stable, parseable: Task 3's checker reads the service/cmd/flag lines) -----------------
print_help() {
  local i=0
  cat <<'EOF'
uso: bash infra/deploy.sh <comando> [serviços...] [flags]
Configuração: infra/.env (copie infra/.env.example) ou --env-file <arquivo>. Runbook: docs/deploy.md.
Formato das linhas abaixo: "<tipo> <nome>  <descrição>" (o nome termina no primeiro espaço duplo).

EOF
  while [ "$i" -lt "${#SERVICE_NAMES[@]}" ]; do
    printf 'service %s  %s\n' "${SERVICE_NAMES[$i]}" "${SERVICE_DESCRIPTIONS[$i]}"
    i=$((i + 1))
  done
  cat <<'EOF'

cmd help  mostra esta ajuda (não precisa de infra/.env nem de ferramentas)
cmd check  confere ferramentas, login do gcloud, ADC e infra/.env; não altera nada
cmd bootstrap  uma vez por projeto: APIs mínimas, quota project do ADC, bucket do estado, terraform init, docker auth (idempotente, nunca apaga)
cmd infra plan  terraform plan da infraestrutura (somente leitura)
cmd infra apply  terraform plan salvo num diretório temporário privado, confirmação "sim" e apply desse plano; mostra os outputs
cmd build  build + push das imagens dos serviços (ou all) com a tag do commit, sem implantar
cmd deploy  build + push (ou --existing-tag) e gcloud run services update --image de cada serviço (ou all, na ordem svc-cotacao svc-apolice svc-sinistro chatbot gateway web); smoke no fim
cmd rollback  volta um serviço para uma tag já publicada (igual a deploy <serviço> --existing-tag <tag>)
cmd smoke  roda node infra/smoke.mjs contra a URL pública (output web_url do Terraform ou --url)
cmd status  imagem, URL e revisão de cada serviço (ou do serviço dado) e os outputs do Terraform
cmd destroy  terraform destroy de tudo; exige --confirm-project <id> e o id digitado (o bucket do estado fica)

flag --yes  dispensa as confirmações "sim" (nunca a do destroy)
flag --tag  <tag>: tag da imagem no build/deploy (padrão: SHA curto do commit); no rollback, a tag publicada a usar
flag --existing-tag  <tag>: deploy sem build, de uma imagem já publicada (verificada antes)
flag --allow-dirty  permite build/deploy com a árvore git suja (tag <sha>-dirty-<aaaammddHHMM>)
flag --no-smoke  não roda o smoke no fim do deploy/rollback
flag --url  <url>: URL pública usada pelo smoke (no lugar da derivada do projeto ou do output web_url)
flag --confirm-project  <id>: obrigatório no destroy, igual ao PROJECT_ID
flag --env-file  <arquivo>: usa outro arquivo de configuração no lugar de infra/.env
flag --help  mostra esta ajuda

exit 0  sucesso
exit 1  outro erro (comando externo falhou)
exit 2  uso ou configuração inválidos
exit 3  pré-condição falhou (ferramenta ausente, árvore suja, tag já existe, imagem não existe)
exit 4  abortado pelo usuário (confirmação diferente do texto exato)
exit 5  smoke falhou
EOF
}

# --- configuration (infra/.env) ------------------------------------------------------------------
BASE_KEYS="PROJECT_ID REGION TF_STATE_BUCKET ARTIFACT_REGISTRY_REPO LOG_LEVEL TRUST_PROXY_HOPS WEB_CUSTOM_DOMAIN_URL BILLING_ACCOUNT_ID BUDGET_AMOUNT_BRL BUDGET_ALERT_EMAIL"
SCALING_KEYS=""
for _svc in $SCALING_ORDER; do
  _p="$(upper "${_svc//-/_}")"
  SCALING_KEYS="$SCALING_KEYS ${_p}_MIN_INSTANCES ${_p}_MAX_INSTANCES ${_p}_MEMORY"
done
ALL_KEYS="$BASE_KEYS$SCALING_KEYS"
CFG_PROJECT_ID=""
CFG_REGION=""
CFG_TF_STATE_BUCKET=""
CFG_ARTIFACT_REGISTRY_REPO=""
CFG_LOG_LEVEL=""
CFG_TRUST_PROXY_HOPS=""
CFG_WEB_CUSTOM_DOMAIN_URL=""
CFG_BILLING_ACCOUNT_ID=""
CFG_BUDGET_AMOUNT_BRL=""
CFG_BUDGET_ALERT_EMAIL=""
for _k in $SCALING_KEYS; do printf -v "CFG_$_k" '%s' ""; done
SCALING_JSON=""
SCALING_WARNINGS=""
ENV_FILE="$ROOT/infra/.env"

# Parses KEY=VALUE lines without executing them (no `source`): only known keys, comments and blank
# lines; one pair of surrounding quotes is removed; no inline comments.
load_env() {
  local line key value lineno=0
  if [ ! -f "$ENV_FILE" ]; then
    die "$EXIT_USAGE" "arquivo de configuração não encontrado: $ENV_FILE. Copie infra/.env.example para infra/.env e preencha (cada chave está documentada no .env.example)."
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in '' | '#'*) continue ;; esac
    case "$line" in 'export '*) line="${line#export }" ;; esac
    case "$line" in *=*) ;; *) die "$EXIT_USAGE" "$ENV_FILE:$lineno: linha sem '='" ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case " $ALL_KEYS " in
      *" $key "*) ;;
      *) die "$EXIT_USAGE" "$ENV_FILE:$lineno: chave desconhecida '$key' (as chaves válidas estão em infra/.env.example)" ;;
    esac
    if [ "${#value}" -ge 2 ]; then
      case "$value" in
        \"*\") value="${value#\"}" && value="${value%\"}" ;;
        \'*\') value="${value#\'}" && value="${value%\'}" ;;
      esac
    fi
    printf -v "CFG_$key" '%s' "$value"
  done <"$ENV_FILE"
}

looks_placeholder() { # true for values copied from the example (example, <...>, changeme)
  case "$(lower "$1")" in *example* | *'<'* | *changeme*) return 0 ;; esac
  return 1
}

validate_config() {
  local svc key prefix min max mem name
  [ -n "$CFG_REGION" ] || CFG_REGION="southamerica-east1"
  [ -n "$CFG_ARTIFACT_REGISTRY_REPO" ] || CFG_ARTIFACT_REGISTRY_REPO="seguradora"

  [ -n "$CFG_PROJECT_ID" ] || die "$EXIT_USAGE" "PROJECT_ID vazio em $ENV_FILE"
  if looks_placeholder "$CFG_PROJECT_ID"; then
    die "$EXIT_USAGE" "PROJECT_ID em $ENV_FILE ainda é o valor de exemplo; coloque o id real do projeto GCP"
  fi
  matches "$CFG_PROJECT_ID" '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' ||
    die "$EXIT_USAGE" "PROJECT_ID inválido (6-30 caracteres: minúsculas, dígitos e hífens)"
  matches "$CFG_REGION" '^[a-z]+-[a-z]+[0-9]+$' || die "$EXIT_USAGE" "REGION inválida: $CFG_REGION"
  matches "$CFG_ARTIFACT_REGISTRY_REPO" '^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$' ||
    die "$EXIT_USAGE" "ARTIFACT_REGISTRY_REPO inválido: $CFG_ARTIFACT_REGISTRY_REPO"
  if [ -n "$CFG_TF_STATE_BUCKET" ]; then
    matches "$CFG_TF_STATE_BUCKET" '^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$' ||
      die "$EXIT_USAGE" "TF_STATE_BUCKET inválido: $CFG_TF_STATE_BUCKET"
  fi
  if [ -n "$CFG_LOG_LEVEL" ]; then
    case "$CFG_LOG_LEVEL" in
      fatal | error | warn | info | debug | trace | silent) ;;
      *) die "$EXIT_USAGE" "LOG_LEVEL inválido: $CFG_LOG_LEVEL (fatal, error, warn, info, debug, trace, silent)" ;;
    esac
  fi
  if [ -n "$CFG_TRUST_PROXY_HOPS" ]; then
    matches "$CFG_TRUST_PROXY_HOPS" '^(0|[1-9][0-9]*)$' || die "$EXIT_USAGE" "TRUST_PROXY_HOPS deve ser um inteiro >= 0"
  fi
  if [ -n "$CFG_WEB_CUSTOM_DOMAIN_URL" ]; then
    matches "$CFG_WEB_CUSTOM_DOMAIN_URL" '^https://[^/]+$' ||
      die "$EXIT_USAGE" "WEB_CUSTOM_DOMAIN_URL deve ser https://<host>, sem caminho nem barra final"
  fi
  if [ -n "$CFG_BILLING_ACCOUNT_ID" ]; then
    matches "$CFG_BILLING_ACCOUNT_ID" '^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$' ||
      die "$EXIT_USAGE" "BILLING_ACCOUNT_ID deve ser XXXXXX-XXXXXX-XXXXXX"
  fi
  if [ -n "$CFG_BUDGET_AMOUNT_BRL" ]; then
    if ! matches "$CFG_BUDGET_AMOUNT_BRL" '^[0-9]+(\.[0-9]+)?$' || matches "$CFG_BUDGET_AMOUNT_BRL" '^[0.]+$'; then
      die "$EXIT_USAGE" "BUDGET_AMOUNT_BRL deve ser um número positivo"
    fi
  fi
  if [ -n "$CFG_BUDGET_ALERT_EMAIL" ]; then
    matches "$CFG_BUDGET_ALERT_EMAIL" '^[^@[:space:]]+@[^@[:space:]]+$' || die "$EXIT_USAGE" "BUDGET_ALERT_EMAIL inválido"
  fi

  # service_scaling: one JSON object built here (no jq), validated per service.
  SCALING_JSON=""
  SCALING_WARNINGS=""
  for svc in $SCALING_ORDER; do
    key="${svc//-/_}"
    prefix="$(upper "$key")"
    name="CFG_${prefix}_MIN_INSTANCES"
    min="${!name}"
    name="CFG_${prefix}_MAX_INSTANCES"
    max="${!name}"
    name="CFG_${prefix}_MEMORY"
    mem="${!name}"
    [ -n "$min" ] || min=0
    if [ -z "$max" ]; then if [ "$svc" = web ]; then max=2; else max=1; fi; fi
    if [ -z "$mem" ]; then if [ "$svc" = web ]; then mem=256Mi; else mem=512Mi; fi; fi
    matches "$min" '^(0|[1-9][0-9]*)$' || die "$EXIT_USAGE" "${prefix}_MIN_INSTANCES deve ser um inteiro >= 0"
    matches "$max" '^(0|[1-9][0-9]*)$' || die "$EXIT_USAGE" "${prefix}_MAX_INSTANCES deve ser um inteiro >= 1"
    [ "$max" -ge 1 ] || die "$EXIT_USAGE" "${prefix}_MAX_INSTANCES deve ser >= 1"
    [ "$max" -ge "$min" ] || die "$EXIT_USAGE" "${prefix}_MAX_INSTANCES ($max) menor que ${prefix}_MIN_INSTANCES ($min)"
    matches "$mem" '^[0-9]+(Mi|Gi)$' || die "$EXIT_USAGE" "${prefix}_MEMORY deve ser <n>Mi ou <n>Gi (ex.: 512Mi)"
    if [ "$svc" != web ] && [ "$max" -gt 1 ]; then
      SCALING_WARNINGS="$SCALING_WARNINGS $svc=$max"
    fi
    [ -z "$SCALING_JSON" ] || SCALING_JSON="$SCALING_JSON,"
    SCALING_JSON="$SCALING_JSON\"$key\":{\"min_instances\":$min,\"max_instances\":$max,\"memory\":\"$mem\"}"
  done
  SCALING_JSON="{$SCALING_JSON}"
}

warn_scaling() {
  local item
  for item in $SCALING_WARNINGS; do
    warn "max_instances de ${item%%=*} = ${item#*=} (> 1): o estado dele fica em memória (sessões/conversas/cotações); com mais de uma instância as requisições se perdem entre instâncias. Use 1 a menos que saiba o que está fazendo."
  done
}

load_config() {
  load_env
  validate_config
}

require_state_bucket() {
  [ -n "$CFG_TF_STATE_BUCKET" ] || die "$EXIT_USAGE" "TF_STATE_BUCKET vazio em $ENV_FILE (bucket do estado do Terraform)"
  if looks_placeholder "$CFG_TF_STATE_BUCKET"; then
    die "$EXIT_USAGE" "TF_STATE_BUCKET em $ENV_FILE ainda é o valor de exemplo"
  fi
}

# The only way configuration reaches Terraform: exactly these TF_VAR_* names. Any other TF_VAR_*
# inherited from the operator's shell is dropped so it cannot change the plan silently; the
# auto-loaded variable files and TF_WORKSPACE / TF_CLI_ARGS* are refused by refuse_tf_overrides.
export_tf_vars() {
  local v
  for v in $(env | sed -n 's/^\(TF_VAR_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$v"; done
  export TF_VAR_project_id="$CFG_PROJECT_ID"
  export TF_VAR_region="$CFG_REGION"
  export TF_VAR_artifact_registry_repo="$CFG_ARTIFACT_REGISTRY_REPO"
  export TF_VAR_service_scaling="$SCALING_JSON"
  # Empty optional values are not exported: the Terraform variable defaults apply.
  if [ -n "$CFG_TRUST_PROXY_HOPS" ]; then export TF_VAR_trust_proxy_hops="$CFG_TRUST_PROXY_HOPS"; fi
  if [ -n "$CFG_WEB_CUSTOM_DOMAIN_URL" ]; then export TF_VAR_web_custom_domain_url="$CFG_WEB_CUSTOM_DOMAIN_URL"; fi
  if [ -n "$CFG_BILLING_ACCOUNT_ID" ]; then export TF_VAR_billing_account_id="$CFG_BILLING_ACCOUNT_ID"; fi
  if [ -n "$CFG_BUDGET_AMOUNT_BRL" ]; then export TF_VAR_budget_amount_brl="$CFG_BUDGET_AMOUNT_BRL"; fi
  if [ -n "$CFG_BUDGET_ALERT_EMAIL" ]; then export TF_VAR_budget_alert_email="$CFG_BUDGET_ALERT_EMAIL"; fi
  if [ -n "$CFG_LOG_LEVEL" ]; then export TF_VAR_log_level="$CFG_LOG_LEVEL"; fi
}

# --- preconditions, confirmation -----------------------------------------------------------------
require_tools() { # require_tools <tool...>
  local t missing=""
  for t in "$@"; do
    command -v "$t" >/dev/null 2>&1 || missing="$missing $t"
  done
  [ -z "$missing" ] || die "$EXIT_PRECONDITION" "ferramenta(s) ausente(s):$missing (rode: bash infra/deploy.sh check)"
}

confirm_sim() { # confirm_sim <what>: typed exact "sim" unless --yes
  local answer=""
  if [ "$OPT_YES" = 1 ]; then
    info "--yes: confirmação dispensada ($1)"
    return 0
  fi
  printf 'Digite "sim" para %s: ' "$1" >&2
  if ! IFS= read -r answer; then answer=""; fi
  [ "$answer" = "sim" ] || die "$EXIT_ABORTED" "abortado: confirmação diferente de \"sim\"; nada foi alterado"
}

# Terraform auto-loads terraform.tfvars, terraform.tfvars.json and *.auto.tfvars(.json) from its
# working dir, and those beat TF_VAR_*; TF_WORKSPACE selects another state and TF_CLI_ARGS* can
# inject -var/-var-file. Any of them would silently override infra/.env, so every command that
# uses Terraform refuses them before its first terraform call (and tf() checks again).
refuse_tf_overrides() {
  local f found="" v vars=""
  for f in "$TF_DIR/terraform.tfvars" "$TF_DIR/terraform.tfvars.json" "$TF_DIR"/*.auto.tfvars "$TF_DIR"/*.auto.tfvars.json; do
    if [ -e "$f" ]; then found="$found infra/terraform/${f##*/}"; fi
  done
  [ -z "$found" ] || die "$EXIT_PRECONDITION" "arquivo(s) de variáveis que o Terraform carrega automaticamente e que têm precedência sobre infra/.env:$found. Remova ou renomeie (ex.: para *.bak); terraform.tfvars.example é permitido. A configuração vem só de $ENV_FILE."
  for v in $(env | sed -n -e 's/^\(TF_WORKSPACE\)=.*/\1/p' -e 's/^\(TF_CLI_ARGS[A-Za-z0-9_]*\)=.*/\1/p'); do vars="$vars $v"; done
  [ -z "$vars" ] || die "$EXIT_PRECONDITION" "variável(is) de ambiente do Terraform herdada(s) do shell:$vars. Elas trocam o workspace ou injetam -var/-var-file por fora de infra/.env; rode sem elas (unset$vars)."
}
tf() {
  refuse_tf_overrides
  terraform -chdir="$TF_DIR" "$@"
}
tf_init() {
  require_state_bucket
  tf init -input=false -backend-config="bucket=$CFG_TF_STATE_BUCKET" -backend-config="prefix=$TF_STATE_PREFIX" >/dev/null
}

# Private temp dir for the saved plan (it holds the session secret in plaintext): mode 700,
# outside the repository, removed by the EXIT/INT/TERM traps.
make_plan_dir() {
  local base="${TMPDIR:-/tmp}" phys rootp
  base="${base%/}"
  PLAN_DIR="$(mktemp -d "$base/seguradora-plan.XXXXXX")"
  chmod 700 "$PLAN_DIR"
  phys="$(cd "$PLAN_DIR" && pwd -P)"
  rootp="$(cd "$ROOT" && pwd -P)"
  case "$phys/" in
    "$rootp/"*) die "$EXIT_PRECONDITION" "o diretório temporário ($phys) fica dentro do repositório; defina TMPDIR fora dele" ;;
  esac
}

git_tag() { # default image tag: <short-sha>, or <short-sha>-dirty-<yyyymmddHHMM> with --allow-dirty
  local sha dirty
  sha="$(git -C "$ROOT" rev-parse --short HEAD)" || die "$EXIT_PRECONDITION" "não foi possível ler o commit atual (git)"
  dirty="$(git -C "$ROOT" status --porcelain)" || die "$EXIT_PRECONDITION" "git status falhou"
  if [ -n "$dirty" ]; then
    [ "$OPT_ALLOW_DIRTY" = 1 ] || die "$EXIT_PRECONDITION" "árvore git suja (commit ou stash antes, ou use --allow-dirty)"
    [ -z "$OPT_TAG" ] || return 0
    TAG="$sha-dirty-$(date -u +%Y%m%d%H%M)"
  else
    [ -z "$OPT_TAG" ] || return 0
    TAG="$sha"
  fi
}

# Docker has no documented distinct exit code for missing manifests. Recognize only
# explicit manifest absence; every other failure stops the entire preflight.
image_exists() {
  local error
  if error="$(docker buildx imagetools inspect "$1" 2>&1 >/dev/null)"; then return 0; fi
  case "$error" in
    "ERROR: $1: not found"|"ERROR: $1: manifest unknown"|"ERROR: manifest unknown: "*) return 1 ;;
    *) die "$EXIT_PRECONDITION" "não foi possível verificar a imagem no registro: $1 (autenticação, rede ou registro; nenhuma imagem foi publicada)" ;;
  esac
}

# --- commands ------------------------------------------------------------------------------------
cmd_check() {
  local tools_bad=0 cfg_bad=0 t path cfg_err account major
  for t in git docker gcloud terraform node; do
    if path="$(command -v "$t" 2>/dev/null)"; then
      info "ok $t ($path)"
    else
      info "FALTA $t (instale e coloque no PATH)"
      tools_bad=1
    fi
  done
  if command -v docker >/dev/null 2>&1; then
    if docker buildx version >/dev/null 2>&1; then info "ok docker buildx"; else
      info "FALTA docker buildx"
      tools_bad=1
    fi
    if docker info >/dev/null 2>&1; then info "ok docker daemon"; else
      info "FALTA docker daemon (Docker Desktop parado?)"
      tools_bad=1
    fi
  fi
  if command -v node >/dev/null 2>&1; then
    major="$(node --version 2>/dev/null | sed -n 's/^v\([0-9][0-9]*\).*/\1/p')"
    if [ -n "$major" ] && [ "$major" -ge 22 ]; then info "ok node v$major"; else
      info "FALTA node >= 22 (o smoke precisa)"
      tools_bad=1
    fi
  fi
  if command -v terraform >/dev/null 2>&1; then
    info "ok $(terraform version 2>/dev/null | head -n 1)"
  fi
  if command -v gcloud >/dev/null 2>&1; then
    account="$(gcloud config get-value account 2>/dev/null || true)"
    if [ -n "$account" ] && [ "$account" != "(unset)" ]; then info "ok gcloud login: $account"; else
      info "FALTA gcloud login (gcloud auth login)"
      tools_bad=1
    fi
    if gcloud auth application-default print-access-token >/dev/null 2>&1; then info "ok ADC"; else
      info "FALTA ADC (gcloud auth application-default login)"
      tools_bad=1
    fi
  fi
  if cfg_err="$(load_config 2>&1 >/dev/null)"; then
    load_config
    info "ok config $ENV_FILE (projeto $CFG_PROJECT_ID, região $CFG_REGION)"
    if [ -z "$CFG_TF_STATE_BUCKET" ] || looks_placeholder "$CFG_TF_STATE_BUCKET"; then
      info "FALTA TF_STATE_BUCKET em $ENV_FILE (bootstrap, infra, status, smoke e destroy precisam)"
      cfg_bad=1
    fi
    warn_scaling
  else
    info "FALTA config: ${cfg_err#ERRO: }"
    cfg_bad=1
  fi
  [ "$tools_bad" = 0 ] || exit "$EXIT_PRECONDITION"
  [ "$cfg_bad" = 0 ] || exit "$EXIT_USAGE"
  info "check ok"
}

cmd_bootstrap() {
  local bucket
  load_config
  require_state_bucket
  require_tools gcloud terraform docker
  refuse_tf_overrides
  bucket="gs://$CFG_TF_STATE_BUCKET"
  info "bootstrap do projeto $CFG_PROJECT_ID ($CFG_REGION):"
  info "  - habilitar cloudresourcemanager e serviceusage"
  info "  - quota project do ADC = $CFG_PROJECT_ID"
  info "  - bucket do estado $bucket (cria se faltar; versionamento, acesso uniforme, prevenção de acesso público)"
  info "  - terraform init com o bucket"
  info "  - docker auth para $CFG_REGION-docker.pkg.dev"
  confirm_sim "executar o bootstrap"
  gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project "$CFG_PROJECT_ID"
  gcloud auth application-default set-quota-project "$CFG_PROJECT_ID"
  if gcloud storage buckets describe "$bucket" --project "$CFG_PROJECT_ID" >/dev/null 2>&1; then
    info "bucket $bucket já existe (não recriado)"
  else
    gcloud storage buckets create "$bucket" --project "$CFG_PROJECT_ID" --location "$CFG_REGION" \
      --uniform-bucket-level-access --public-access-prevention
  fi
  gcloud storage buckets update "$bucket" --project "$CFG_PROJECT_ID" --versioning \
    --uniform-bucket-level-access --public-access-prevention
  export_tf_vars
  tf_init
  gcloud auth configure-docker "$CFG_REGION-docker.pkg.dev" --quiet
  info "bootstrap ok. Próximo: bash infra/deploy.sh infra apply"
}

cmd_infra() { # cmd_infra plan|apply
  local sub="$1" planfile rc summary
  load_config
  require_state_bucket
  require_tools terraform
  refuse_tf_overrides
  export_tf_vars
  warn_scaling
  make_plan_dir
  planfile="$PLAN_DIR/tfplan"
  tf_init
  # The human plan output is printed as is: Terraform masks sensitive values as
  # "(sensitive value)". The saved plan file and `terraform show` of it are NOT masked, so they
  # only ever go to files inside PLAN_DIR, never to the terminal.
  info "== terraform plan (projeto $CFG_PROJECT_ID)"
  set +e
  tf plan -input=false -detailed-exitcode -out="$planfile"
  rc=$?
  set -e
  case "$rc" in
    0)
      info "Nenhuma mudança na infraestrutura."
      cleanup
      return 0
      ;;
    2) ;;
    *) die 1 "terraform plan falhou (exit $rc)" ;;
  esac
  if [ "$sub" = plan ]; then
    cleanup
    info "Plano não aplicado. Para aplicar: bash infra/deploy.sh infra apply"
    return 0
  fi
  tf show -no-color "$planfile" >"$PLAN_DIR/plan.txt"
  summary="$(grep -E '^(Plan:|Changes to Outputs:)' "$PLAN_DIR/plan.txt" | head -n 1 || true)"
  info "Resumo: ${summary:-sem linha de resumo (veja o plano acima)}"
  confirm_sim "aplicar este plano no projeto $CFG_PROJECT_ID"
  if ! tf apply -input=false "$planfile"; then
    die 1 "terraform apply falhou"
  fi
  cleanup
  info "== outputs"
  tf output
}

# build_or_deploy <build|deploy> <services...>
build_or_deploy() {
  local mode="$1" svc ref df services rest desc rev url smoke_url number
  shift
  services="$(sort_services "$@")"
  services="${services% }"
  load_config
  if [ -n "$OPT_EXISTING_TAG" ]; then
    TAG="$OPT_EXISTING_TAG"
  else
    require_tools git
    git_tag
  fi
  if [ "$mode" = deploy ]; then
    if [ "$OPT_NO_SMOKE" = 1 ]; then require_tools docker gcloud; else require_tools docker gcloud node; fi
  else
    require_tools docker
  fi

  # Preflight for every service before anything is pushed or updated.
  for svc in $services; do
    ref="$(image_ref "$svc" "$TAG")"
    if [ -n "$OPT_EXISTING_TAG" ]; then
      image_exists "$ref" || die "$EXIT_PRECONDITION" "imagem não encontrada no registro: $ref"
    else
      dockerfile_for "$svc" >/dev/null
      if image_exists "$ref"; then
        die "$EXIT_PRECONDITION" "a tag $TAG já existe para $svc ($ref); não sobrescrevo. Use outra --tag ou deploy --existing-tag $TAG"
      fi
    fi
  done

  info "projeto $CFG_PROJECT_ID, região $CFG_REGION, tag $TAG"
  for svc in $services; do
    ref="$(image_ref "$svc" "$TAG")"
    if [ -n "$OPT_EXISTING_TAG" ]; then
      info "  $svc: imagem existente $ref -> Cloud Run $(run_name_for "$svc")"
    elif [ "$mode" = deploy ]; then
      info "  $svc: build+push de $(dockerfile_for "$svc") -> $ref -> Cloud Run $(run_name_for "$svc")"
    else
      info "  $svc: build+push de $(dockerfile_for "$svc") -> $ref"
    fi
    warn_fake "$svc"
  done
  if [ "$mode" = deploy ]; then confirm_sim "implantar ($services)"; else confirm_sim "publicar as imagens ($services)"; fi

  UPDATED_SERVICES=""
  for svc in $services; do
    ref="$(image_ref "$svc" "$TAG")"
    rest="${services#*"$svc"}"
    if [ -z "$OPT_EXISTING_TAG" ]; then
      df="$(dockerfile_for "$svc")"
      warn_fake "$svc"
      info "== build $svc ($df)"
      if ! docker buildx build --platform linux/amd64 --provenance=false --push -f "$ROOT/$df" -t "$ref" "$ROOT"; then
        deploy_failed "$svc" "build/push" "$rest"
      fi
    fi
    [ "$mode" = deploy ] || continue
    info "== deploy $svc -> $ref"
    if ! gcloud run services update "$(run_name_for "$svc")" --image "$ref" --region "$CFG_REGION" --project "$CFG_PROJECT_ID"; then
      deploy_failed "$svc" "gcloud run services update" "$rest"
    fi
    UPDATED_SERVICES="$UPDATED_SERVICES $svc"
    if desc="$(gcloud run services describe "$(run_name_for "$svc")" --region "$CFG_REGION" --project "$CFG_PROJECT_ID" \
      --format='value(status.latestReadyRevisionName,status.url)')"; then
      rev="${desc%%$'\t'*}"
      url="${desc#*$'\t'}"
      info "  $svc: revisão $rev  url $url"
    else
      warn "não foi possível ler revisão/URL de $svc (o update terminou)"
    fi
  done

  if [ "$mode" = build ]; then
    info "build ok (tag $TAG): $services"
    return 0
  fi
  info "deploy ok (tag $TAG):$UPDATED_SERVICES"
  UPDATED_SERVICES=""
  [ "$OPT_NO_SMOKE" = 0 ] || return 0

  # Smoke URL without Terraform (deploy never runs terraform): --url, else the custom domain,
  # else the deterministic Cloud Run URL of web (the same one Terraform wires into the env).
  if [ -n "$OPT_URL" ]; then
    smoke_url="$OPT_URL"
  elif [ -n "$CFG_WEB_CUSTOM_DOMAIN_URL" ]; then
    smoke_url="$CFG_WEB_CUSTOM_DOMAIN_URL"
  else
    number="$(gcloud projects describe "$CFG_PROJECT_ID" --format='value(projectNumber)')" ||
      die 1 "não foi possível ler o número do projeto para a URL do smoke (use --url ou --no-smoke)"
    matches "$number" '^[0-9]+$' || die 1 "número do projeto inesperado: $number (use --url)"
    smoke_url="https://web-$number.$CFG_REGION.run.app"
  fi
  info "== smoke $smoke_url"
  node "$SMOKE_SCRIPT" "$smoke_url" ||
    die "$EXIT_SMOKE" "smoke falhou — o serviço foi atualizado mesmo assim; use rollback se necessário"
}

deploy_failed() { # deploy_failed <service> <step> <services not reached>
  local done_list="${UPDATED_SERVICES:- nenhum}" rest="$3"
  rest="${rest# }"
  rest="${rest% }"
  UPDATED_SERVICES=""
  die 1 "falha em $1 ($2). Já atualizados:$done_list. Não tentados: ${rest:-nenhum}. Os já atualizados continuam com a imagem nova (use rollback se necessário)."
}

cmd_smoke() {
  local url
  if [ -n "$OPT_URL" ]; then
    url="$OPT_URL"
    require_tools node
  else
    load_config
    require_tools terraform node
    refuse_tf_overrides
    export_tf_vars
    tf_init
    url="$(tf output -raw web_url)" || die 1 "não foi possível ler o output web_url (use --url)"
  fi
  info "== smoke $url"
  node "$SMOKE_SCRIPT" "$url" || die "$EXIT_SMOKE" "smoke falhou em $url"
}

cmd_status() {
  local svc failed=0
  load_config
  require_tools gcloud
  refuse_tf_overrides
  for svc in $(sort_services "$@"); do
    info "== $svc (imagem, URL, revisão)"
    gcloud run services describe "$(run_name_for "$svc")" --region "$CFG_REGION" --project "$CFG_PROJECT_ID" \
      --format='value(spec.template.spec.containers[0].image,status.url,status.latestReadyRevisionName)' ||
      { warn "não foi possível descrever $svc"; failed=1; }
  done
  if [ -n "$CFG_TF_STATE_BUCKET" ] && ! looks_placeholder "$CFG_TF_STATE_BUCKET" && command -v terraform >/dev/null 2>&1; then
    info "== outputs do Terraform"
    export_tf_vars
    if tf_init; then
      tf output || { warn "terraform output falhou"; failed=1; }
    else
      warn "terraform init falhou"
      failed=1
    fi
  else
    info "(outputs do Terraform omitidos: falta TF_STATE_BUCKET ou terraform)"
  fi
  return "$failed"
}

cmd_destroy() {
  local answer=""
  [ -n "$OPT_CONFIRM_PROJECT" ] || die "$EXIT_USAGE" "destroy exige --confirm-project <PROJECT_ID>"
  load_config
  require_state_bucket
  require_tools terraform
  refuse_tf_overrides
  [ "$OPT_CONFIRM_PROJECT" = "$CFG_PROJECT_ID" ] ||
    die "$EXIT_ABORTED" "--confirm-project não confere com PROJECT_ID de $ENV_FILE; nada foi alterado"
  info "DESTRUIR toda a infraestrutura do projeto $CFG_PROJECT_ID (serviços, registro e imagens, segredo, rede, contas)."
  info "O bucket do estado gs://$CFG_TF_STATE_BUCKET NÃO é apagado (apague à mão se quiser)."
  printf 'Digite o id do projeto (%s) para destruir: ' "$CFG_PROJECT_ID" >&2
  if ! IFS= read -r answer; then answer=""; fi
  [ "$answer" = "$CFG_PROJECT_ID" ] || die "$EXIT_ABORTED" "abortado: id digitado não confere; nada foi alterado"
  export_tf_vars
  warn_scaling
  tf_init
  # The two typed confirmations above replace Terraform's own prompt.
  tf destroy -input=false -auto-approve
}

# --- argument parsing ----------------------------------------------------------------------------
OPT_YES=0
OPT_TAG=""
OPT_EXISTING_TAG=""
OPT_ALLOW_DIRTY=0
OPT_NO_SMOKE=0
OPT_URL=""
OPT_CONFIRM_PROJECT=""
OPT_HELP=0
FLAGS_SEEN=""
POSITIONAL=()
TAG=""
flag=""

need_value() { # need_value <flag> <remaining arg count>
  [ "$2" -ge 2 ] || die "$EXIT_USAGE" "$1 precisa de um valor"
}

while [ "$#" -gt 0 ]; do
  flag="$1"
  case "$1" in
    --yes) OPT_YES=1 ;;
    --allow-dirty) OPT_ALLOW_DIRTY=1 ;;
    --no-smoke) OPT_NO_SMOKE=1 ;;
    --help | -h) OPT_HELP=1 ;;
    --tag)
      need_value "$1" "$#"
      OPT_TAG="$2"
      shift
      ;;
    --existing-tag)
      need_value "$1" "$#"
      OPT_EXISTING_TAG="$2"
      shift
      ;;
    --url)
      need_value "$1" "$#"
      OPT_URL="$2"
      shift
      ;;
    --confirm-project)
      need_value "$1" "$#"
      OPT_CONFIRM_PROJECT="$2"
      shift
      ;;
    --env-file)
      need_value "$1" "$#"
      ENV_FILE="$2"
      shift
      ;;
    -*) die "$EXIT_USAGE" "flag desconhecida: $1 (veja: bash infra/deploy.sh help)" ;;
    *)
      POSITIONAL+=("$1")
      shift
      continue
      ;;
  esac
  case "$flag" in -h) FLAGS_SEEN="$FLAGS_SEEN --help" ;; *) FLAGS_SEEN="$FLAGS_SEEN $flag" ;; esac
  shift
done

if [ "$OPT_HELP" = 1 ] || [ "${#POSITIONAL[@]}" -eq 0 ]; then
  print_help
  exit "$EXIT_OK"
fi

COMMAND="${POSITIONAL[0]}"
ARGS=()
if [ "${#POSITIONAL[@]}" -gt 1 ]; then ARGS=("${POSITIONAL[@]:1}"); fi

allow_flags() { # allow_flags <flag...>: fails on any flag given that the command does not accept
  local f
  for f in $FLAGS_SEEN; do
    case " $* --env-file " in
      *" $f "*) ;;
      *) die "$EXIT_USAGE" "a flag $f não se aplica a '$COMMAND' (veja: bash infra/deploy.sh help)" ;;
    esac
  done
}
no_args() {
  [ "${#ARGS[@]}" -eq 0 ] || die "$EXIT_USAGE" "'$COMMAND' não recebe argumentos: ${ARGS[*]}"
}
check_tag() { # check_tag <flag> <value>
  matches "$2" '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$' || die "$EXIT_USAGE" "$1 inválida: '$2' (tag Docker)"
}
SELECTED=""
select_services() { # select_services <name...|all>: validates, sets SELECTED
  local s
  SELECTED=""
  [ "$#" -gt 0 ] || die "$EXIT_USAGE" "informe o(s) serviço(s) ou all. Válidos: $(valid_services)"
  for s in "$@"; do
    if [ "$s" = all ]; then
      SELECTED="$(valid_services)"
      return 0
    fi
    service_index "$s" >/dev/null || die "$EXIT_USAGE" "serviço desconhecido '$s'. Válidos: $(valid_services)(ou all)"
    SELECTED="$SELECTED $s"
  done
}
check_url() {
  [ -z "$OPT_URL" ] || matches "$OPT_URL" '^https?://[^[:space:]]+$' || die "$EXIT_USAGE" "--url deve começar com http:// ou https://"
}

case "$COMMAND" in
  help)
    print_help
    ;;
  check)
    allow_flags
    no_args
    cmd_check
    ;;
  bootstrap)
    allow_flags --yes
    no_args
    cmd_bootstrap
    ;;
  infra)
    case "${ARGS[0]:-}" in
      plan) allow_flags ;;
      apply) allow_flags --yes ;;
      *) die "$EXIT_USAGE" "uso: bash infra/deploy.sh infra plan|apply" ;;
    esac
    [ "${#ARGS[@]}" -eq 1 ] || die "$EXIT_USAGE" "uso: bash infra/deploy.sh infra plan|apply"
    cmd_infra "${ARGS[0]}"
    ;;
  build)
    allow_flags --tag --yes --allow-dirty
    [ -z "$OPT_TAG" ] || check_tag --tag "$OPT_TAG"
    select_services ${ARGS[@]+"${ARGS[@]}"}
    TAG="$OPT_TAG"
    # shellcheck disable=SC2086 # SELECTED is a space-separated list of validated service names
    build_or_deploy build $SELECTED
    ;;
  deploy)
    allow_flags --tag --existing-tag --yes --allow-dirty --no-smoke --url
    [ -z "$OPT_TAG" ] || [ -z "$OPT_EXISTING_TAG" ] || die "$EXIT_USAGE" "use --tag ou --existing-tag, não os dois"
    [ -z "$OPT_TAG" ] || check_tag --tag "$OPT_TAG"
    [ -z "$OPT_EXISTING_TAG" ] || check_tag --existing-tag "$OPT_EXISTING_TAG"
    check_url
    select_services ${ARGS[@]+"${ARGS[@]}"}
    TAG="$OPT_TAG"
    # shellcheck disable=SC2086 # SELECTED is a space-separated list of validated service names
    build_or_deploy deploy $SELECTED
    ;;
  rollback)
    allow_flags --tag --yes --no-smoke --url
    [ "${#ARGS[@]}" -eq 1 ] || die "$EXIT_USAGE" "uso: bash infra/deploy.sh rollback <serviço> --tag <tag publicada>"
    [ -n "$OPT_TAG" ] || die "$EXIT_USAGE" "rollback exige --tag <tag publicada>"
    check_tag --tag "$OPT_TAG"
    check_url
    select_services "${ARGS[0]}"
    [ "${ARGS[0]}" != all ] || die "$EXIT_USAGE" "rollback é de um serviço por vez"
    OPT_EXISTING_TAG="$OPT_TAG"
    OPT_TAG=""
    # shellcheck disable=SC2086 # SELECTED is a validated service name
    build_or_deploy deploy $SELECTED
    ;;
  smoke)
    allow_flags --url
    no_args
    check_url
    cmd_smoke
    ;;
  status)
    allow_flags
    if [ "${#ARGS[@]}" -eq 0 ]; then
      select_services all
    else
      select_services "${ARGS[@]}"
    fi
    # shellcheck disable=SC2086 # SELECTED is a space-separated list of validated service names
    cmd_status $SELECTED
    ;;
  destroy)
    allow_flags --confirm-project
    no_args
    cmd_destroy
    ;;
  *)
    die "$EXIT_USAGE" "comando desconhecido: $COMMAND (veja: bash infra/deploy.sh help)"
    ;;
esac
