#!/usr/bin/env bash
# Offline tests of infra/deploy.sh (no Docker, no cloud): bash infra/deploy.test.sh
#   (or: pnpm test:deploy; also part of the root `pnpm test`).
# Each scenario copies the script into a throwaway repo under a temp dir and runs it with
# `env -i` and a PATH whose gcloud/docker/terraform/git/node are fakes that append their argv
# to a log and answer from FAKE_* environment variables. Nothing here can reach GCP: the base
# PATH is a private dir of symlinks to a fixed list of system utilities (never /usr/bin itself),
# and the suite refuses to run when a real gcloud/docker/terraform is reachable through it.
# Runs every scenario under /bin/bash (3.2 on macOS) and, when present, a Homebrew bash.
# Written for bash 3.2: no mapfile, associative arrays, ${var,,}, and no bare "${arr[@]}" of a
# possibly empty array under `set -u`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HERE/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}"/deploy-test.XXXXXX)"
TMP="$(cd "$TMP" && pwd -P)"
trap 'rm -rf "$TMP"' EXIT

# Hermetic base PATH: a private dir with symlinks to ONLY the system utilities deploy.sh and the
# fakes call. /usr/bin is never on the scenario PATH, so a real gcloud/docker/terraform there
# (GitHub's ubuntu-latest has docker and gcloud in /usr/bin) can never be reached.
SYSBIN="$TMP/sysbin"
SYSTEM_TOOLS="basename cat chmod date dirname env grep head ls mktemp rm sed sort tr"
mkdir -p "$SYSBIN"
for tool in $SYSTEM_TOOLS; do
  real="$(type -P "$tool" 2>/dev/null || true)"
  if [ -z "$real" ]; then
    echo "ABORT: system utility '$tool' not found in PATH; the deploy tests need: $SYSTEM_TOOLS" >&2
    exit 1
  fi
  ln -s "$real" "$SYSBIN/$tool"
done
BASE_PATH="$SYSBIN"
for tool in gcloud docker terraform; do
  if PATH="$BASE_PATH" command -v "$tool" >/dev/null 2>&1; then
    echo "ABORT: a real $tool is reachable through $BASE_PATH; refusing to run (tests must stay offline)" >&2
    exit 1
  fi
done

SECRET_CANARY="CANARY-s3cr3t-9f8e7d6c5b4a"
PROJECT="seguradora-poc-123"
SMOKE_URL_FROM_NUMBER="https://web-123456789012.southamerica-east1.run.app"
DEFAULT_SCALING='{"web":{"min_instances":0,"max_instances":2,"memory":"256Mi"},"gateway":{"min_instances":0,"max_instances":1,"memory":"512Mi"},"chatbot":{"min_instances":0,"max_instances":1,"memory":"512Mi"},"svc_cotacao":{"min_instances":0,"max_instances":1,"memory":"512Mi"},"svc_apolice":{"min_instances":0,"max_instances":1,"memory":"512Mi"},"svc_sinistro":{"min_instances":0,"max_instances":1,"memory":"512Mi"}}'

# --- fake binaries -----------------------------------------------------------------------------
FAKEBIN="$TMP/fakebin"
ONLYGITNODE="$TMP/onlygitnode"
mkdir -p "$FAKEBIN" "$ONLYGITNODE"
cat >"$FAKEBIN/fake" <<'FAKE'
#!/bin/bash
# Generic fake: logs argv, answers from FAKE_* env vars.
tool="$(basename "$0")"
{
  printf '%s' "$tool"
  for a in "$@"; do printf ' %s' "$a"; done
  printf '\n'
} >>"$FAKE_LOG"
args=" $* "
after() { # after <word> args...: prints the argument right after <word>
  local w="$1" prev=""
  shift
  for a in "$@"; do
    if [ "$prev" = "$w" ]; then
      printf '%s' "$a"
      return 0
    fi
    prev="$a"
  done
}
case "$tool" in
  git)
    case "$args" in
      *" rev-parse --short HEAD "*) echo "${FAKE_GIT_SHA:-abc1234}" ;;
      *" status --porcelain "*) if [ -n "${FAKE_GIT_DIRTY:-}" ]; then printf '%s\n' "$FAKE_GIT_DIRTY"; fi ;;
      *" rev-parse --is-inside-work-tree "*) echo true ;;
      *" --version "*) echo "git version 2.fake" ;;
    esac
    exit 0
    ;;
  node)
    case "$args" in
      *" --version "*) echo "v22.12.0"; exit 0 ;;
    esac
    exit "${FAKE_NODE_EXIT:-0}"
    ;;
  docker)
    case "$args" in
      *" buildx imagetools inspect "*)
        if [ "${FAKE_IMAGE_EXISTS:-0}" = 1 ]; then exit 0; fi
        printf '%s\n' "${FAKE_INSPECT_ERROR:-ERROR: $4: not found}" >&2
        exit 1
        ;;
      *" buildx build "*) exit "${FAKE_DOCKER_BUILD_EXIT:-0}" ;;
      *" buildx version "*) echo "github.com/docker/buildx v0.fake" ;;
    esac
    exit 0
    ;;
  gcloud)
    case "$args" in
      *" run services update "*)
        svc="$(after update "$@")"
        if [ -n "${FAKE_GCLOUD_FAIL_SERVICE:-}" ] && [ "$svc" = "$FAKE_GCLOUD_FAIL_SERVICE" ]; then
          echo "ERROR: fake failure updating $svc" >&2
          exit 1
        fi
        ;;
      *" run services describe "*)
        svc="$(after describe "$@")"
        if [ "$svc" = "${FAKE_DESCRIBE_FAIL_SERVICE:-}" ]; then echo "ERROR: describe failed" >&2; exit 1; fi
        printf '%s-00002-fak\thttps://%s-fake.a.run.app\n' "$svc" "$svc"
        ;;
      *" projects describe "*) echo "123456789012" ;;
      *" storage buckets describe "*)
        if [ "${FAKE_BUCKET_EXISTS:-0}" != 1 ]; then
          echo "ERROR: fake 404" >&2
          exit 1
        fi
        echo "name: fake-bucket"
        ;;
      *" config get-value account "*) echo "operator@example.com" ;;
      *" --version "*) echo "Google Cloud SDK fake" ;;
    esac
    exit 0
    ;;
  terraform)
    sub=""
    for a in "$@"; do
      case "$a" in
        -*) ;;
        *) sub="$a"; break ;;
      esac
    done
    env | grep '^TF_VAR_' | sort >"$FAKE_STATE/tfvars.$sub" || true
    case "$sub" in
      version) echo "Terraform v1.10.0" ;;
      init) echo "Terraform has been successfully initialized!"; exit "${FAKE_TF_INIT_EXIT:-0}" ;;
      plan)
        out=""
        for a in "$@"; do case "$a" in -out=*) out="${a#-out=}" ;; esac; done
        if [ -n "$out" ]; then
          printf 'binary plan %s\n' "$FAKE_SECRET" >"$out"
          printf '%s\n' "$out" >"$FAKE_STATE/planfile"
          ls -ld "$(dirname "$out")" >"$FAKE_STATE/plandir.ls"
        fi
        echo '  + secret_data = (sensitive value)'
        echo 'Plan: 2 to add, 1 to change, 0 to destroy.'
        exit "${FAKE_TF_PLAN_EXIT:-2}"
        ;;
      show)
        echo "  + secret_data = \"$FAKE_SECRET\""
        echo 'Plan: 2 to add, 1 to change, 0 to destroy.'
        ;;
      apply)
        last=""
        for a in "$@"; do last="$a"; done
        if [ -f "$last" ]; then echo yes >"$FAKE_STATE/apply_saw_plan"; fi
        if [ "${FAKE_TF_APPLY_SIGINT:-0}" = 1 ]; then
          kill -INT "$PPID"
          kill -INT $$
          sleep 1
        fi
        exit "${FAKE_TF_APPLY_EXIT:-0}"
        ;;
      output)
        if [ "${FAKE_TF_OUTPUT_EXIT:-0}" != 0 ]; then echo "ERROR: output failed" >&2; exit "$FAKE_TF_OUTPUT_EXIT"; fi
        case "$args" in
          *" -raw web_url "*) printf '%s' "https://web-from-tf.example.run.app" ;;
          *) echo 'web_url = "https://web-from-tf.example.run.app"' ;;
        esac
        ;;
      destroy) echo "Destroy complete!" ;;
    esac
    exit 0
    ;;
esac
exit 0
FAKE
chmod +x "$FAKEBIN/fake"
for tool in gcloud docker terraform git node; do ln -s fake "$FAKEBIN/$tool"; done
cp "$FAKEBIN/fake" "$ONLYGITNODE/fake"
ln -s fake "$ONLYGITNODE/git"
ln -s fake "$ONLYGITNODE/node"

# --- scenario plumbing -------------------------------------------------------------------------
N=0
REPO=""
LOG=""
STATE=""
OUT=""
RC=0
RUN_PATH=""
RUN_TMPDIR=""
EXTRA_ENV=()
CURRENT=""
FAILS=0
SCENARIO_FAILED=0

write_env() { # write_env [extra lines...]: a valid infra/.env plus the given lines
  {
    echo "# test env"
    echo "PROJECT_ID=$PROJECT"
    echo "REGION=southamerica-east1"
    echo "TF_STATE_BUCKET=$PROJECT-tfstate"
    echo "ARTIFACT_REGISTRY_REPO=seguradora"
    echo "LOG_LEVEL=info"
    for line in "$@"; do echo "$line"; done
  } >"$REPO/infra/.env"
}

new_repo() {
  N=$((N + 1))
  REPO="$TMP/case$N/repo"
  STATE="$TMP/case$N/state"
  RUN_TMPDIR="$TMP/case$N/systmp"
  mkdir -p "$REPO/infra/fake-services" "$REPO/infra/terraform" "$STATE" "$RUN_TMPDIR"
  for app in web gateway chatbot svc-cotacao svc-apolice svc-sinistro; do mkdir -p "$REPO/apps/$app"; done
  for app in web gateway chatbot; do echo "FROM scratch" >"$REPO/apps/$app/Dockerfile"; done
  echo "FROM scratch" >"$REPO/infra/fake-services/Dockerfile"
  cp "$SRC_ROOT/infra/deploy.sh" "$REPO/infra/deploy.sh" 2>/dev/null || true
  cp "$SRC_ROOT/infra/.env.example" "$REPO/infra/.env.example" 2>/dev/null || true
  echo "// fake smoke" >"$REPO/infra/smoke.mjs"
  LOG="$STATE/calls.log"
  OUT="$STATE/out.txt"
  : >"$LOG"
  RUN_PATH="$FAKEBIN:$BASE_PATH"
  EXTRA_ENV=()
  write_env
}

run_deploy() { # run_deploy <stdin text> <deploy.sh args...>   ("<EOF>" = empty stdin)
  local input="$1"
  shift
  if [ "$input" = "<EOF>" ]; then : >"$STATE/stdin"; else printf '%s\n' "$input" >"$STATE/stdin"; fi
  set +e
  env -i HOME="$TMP" PATH="$RUN_PATH" TMPDIR="$RUN_TMPDIR" FAKE_LOG="$LOG" FAKE_STATE="$STATE" \
    FAKE_SECRET="$SECRET_CANARY" ${EXTRA_ENV[@]+"${EXTRA_ENV[@]}"} \
    "$BASH_BIN" "$REPO/infra/deploy.sh" "$@" <"$STATE/stdin" >"$OUT" 2>&1
  RC=$?
  set -e
  # A utility missing from SYSBIN must fail loudly, never pass as an expected nonzero exit.
  if grep -qE 'command not found|No such file or directory' "$OUT"; then
    fail "a command was not found (add it to SYSTEM_TOOLS?)"
  fi
}

fail() {
  echo "  FAIL [$CURRENT] $*"
  FAILS=$((FAILS + 1))
  if [ "$SCENARIO_FAILED" = 0 ]; then
    SCENARIO_FAILED=1
    echo "  ---- output (exit $RC):"
    sed 's/^/  | /' "$OUT" 2>/dev/null | tail -n 25 || true
    echo "  ---- calls:"
    sed 's/^/  > /' "$LOG" 2>/dev/null | tail -n 25 || true
  fi
}
assert_rc() { [ "$RC" = "$1" ] || fail "exit $RC, expected $1"; }
assert_out() { grep -qF -- "$1" "$OUT" || fail "output lacks '$1'"; }
refute_out() { if grep -qF -- "$1" "$OUT"; then fail "output must not contain '$1'"; fi; }
assert_log() { grep -qE -- "$1" "$LOG" || fail "calls log lacks /$1/"; }
refute_log() { if grep -qE -- "$1" "$LOG"; then fail "calls log must not match /$1/"; fi; }
log_count() { grep -cE -- "$1" "$LOG" || true; }
assert_count() { # assert_count <n> <regex>
  local c
  c="$(log_count "$2")"
  [ "$c" = "$1" ] || fail "calls log has $c lines matching /$2/, expected $1"
}
no_mutation() { # no mutating cloud/registry/terraform call in the log
  refute_log '^gcloud run services update'
  refute_log '^docker buildx build'
  refute_log '^terraform( -chdir=[^ ]+)? (apply|destroy)( |$)'
  refute_log '^gcloud (services enable|storage buckets (create|update))'
}
plan_path() { # plan file path the fake terraform saw; "" when none (then dirname is ".", which exists)
  cat "$STATE/planfile" 2>/dev/null || true
}
OTHER_SERVICES_RE='(^|[^a-z])(web|chatbot|svc-cotacao|svc-apolice|svc-sinistro)([^a-z-]|$)'

# --- scenarios ---------------------------------------------------------------------------------
t_help_lists_services_commands_flags() {
  local s c f
  rm -f "$REPO/infra/.env"
  RUN_PATH="$BASE_PATH"
  run_deploy "<EOF>" help
  assert_rc 0
  cp "$OUT" "$STATE/help.txt"
  for s in web gateway chatbot svc-cotacao svc-apolice svc-sinistro; do
    grep -qE "^service $s  [^ ]" "$OUT" || fail "help lacks 'service $s  <desc>'"
  done
  for c in help check bootstrap "infra plan" "infra apply" build deploy rollback smoke status destroy; do
    grep -qE "^cmd $c  [^ ]" "$OUT" || fail "help lacks 'cmd $c  <desc>'"
  done
  for f in --yes --tag --existing-tag --allow-dirty --no-smoke --url --confirm-project --env-file --help; do
    grep -qE "^flag $f  [^ ]" "$OUT" || fail "help lacks 'flag $f  <desc>'"
  done
  [ "$(grep -c '^service ' "$OUT" || true)" = 6 ] || fail "help must list exactly 6 services"
  run_deploy "<EOF>" --help
  assert_rc 0
  cmp -s "$OUT" "$STATE/help.txt" || fail "--help differs from help"
  run_deploy "<EOF>"
  assert_rc 0
  cmp -s "$OUT" "$STATE/help.txt" || fail "no-args output differs from help"
}

t_missing_env_names_example() {
  rm -f "$REPO/infra/.env"
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 2
  assert_out ".env.example"
  no_mutation
}

t_env_file_flag() {
  mv "$REPO/infra/.env" "$STATE/other.env"
  run_deploy "<EOF>" deploy gateway --yes --no-smoke --env-file "$STATE/other.env"
  assert_rc 0
  assert_count 1 '^gcloud run services update gateway '
}

t_empty_or_example_project_id() {
  write_env "PROJECT_ID="
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 2
  assert_out "PROJECT_ID"
  cp "$REPO/infra/.env.example" "$REPO/infra/.env"
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 2
  assert_out "PROJECT_ID"
  no_mutation
}

t_unknown_env_key_and_bad_values() {
  write_env "GATEWAY_MAX_INSTANCE=2"
  run_deploy "<EOF>" infra plan
  assert_rc 2
  assert_out "GATEWAY_MAX_INSTANCE"
  write_env "WEB_MEMORY=256MB"
  run_deploy "<EOF>" infra plan
  assert_rc 2
  assert_out "WEB_MEMORY"
  write_env "CHATBOT_MIN_INSTANCES=2" "CHATBOT_MAX_INSTANCES=1"
  run_deploy "<EOF>" infra plan
  assert_rc 2
  assert_out "CHATBOT_MAX_INSTANCES"
  write_env "WEB_MAX_INSTANCES=0"
  run_deploy "<EOF>" infra plan
  assert_rc 2
  write_env "SVC_APOLICE_MIN_INSTANCES=-1"
  run_deploy "<EOF>" infra plan
  assert_rc 2
  write_env "LOG_LEVEL=loud"
  run_deploy "<EOF>" infra plan
  assert_rc 2
  refute_log '^terraform'
}

t_unknown_service_lists_valid() {
  local s
  run_deploy "<EOF>" deploy gatway --yes
  assert_rc 2
  for s in web gateway chatbot svc-cotacao svc-apolice svc-sinistro; do assert_out "$s"; done
  no_mutation
}

t_unknown_flag_and_bad_combos() {
  run_deploy "<EOF>" deploy gateway --frobnicate
  assert_rc 2
  run_deploy "<EOF>" deploy gateway --tag a --existing-tag b
  assert_rc 2
  run_deploy "<EOF>" build gateway --existing-tag b
  assert_rc 2
  run_deploy "<EOF>" deploy gateway --tag 'bad tag!'
  assert_rc 2
  run_deploy "<EOF>" rollback gateway
  assert_rc 2
  run_deploy "<EOF>" rollback gateway web --tag x
  assert_rc 2
  run_deploy "<EOF>" infra frob
  assert_rc 2
  run_deploy "<EOF>" frob
  assert_rc 2
  no_mutation
}

t_check_reports_missing_tools() {
  RUN_PATH="$ONLYGITNODE:$BASE_PATH"
  run_deploy "<EOF>" check
  assert_rc 3
  for tool in gcloud docker terraform; do
    grep -qE "FALTA.*$tool" "$OUT" || fail "check does not report missing $tool"
  done
}

t_check_all_ok() {
  run_deploy "<EOF>" check
  assert_rc 0
  assert_out "operator@example.com"
  no_mutation
}

t_check_warns_in_memory_scaling() {
  write_env "GATEWAY_MAX_INSTANCES=3"
  run_deploy "<EOF>" check
  assert_rc 0
  assert_out "AVISO"
  assert_out "gateway"
}

t_dirty_tree_refused() {
  EXTRA_ENV=("FAKE_GIT_DIRTY= M apps/gateway/src/main.ts")
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 3
  refute_log '^(docker|terraform|gcloud)'
  run_deploy "<EOF>" build gateway --yes
  assert_rc 3
  refute_log '^(docker|terraform|gcloud)'
}

t_allow_dirty_tag() {
  EXTRA_ENV=("FAKE_GIT_DIRTY= M x")
  run_deploy "<EOF>" deploy gateway --yes --allow-dirty --no-smoke
  assert_rc 0
  assert_log '^docker buildx build .*/gateway:abc1234-dirty-[0-9]{12} '
}

t_build_existing_tag_refused() {
  EXTRA_ENV=("FAKE_IMAGE_EXISTS=1")
  run_deploy "<EOF>" build gateway --yes
  assert_rc 3
  assert_log '^docker buildx imagetools inspect southamerica-east1-docker.pkg.dev/'"$PROJECT"'/seguradora/gateway:abc1234$'
  refute_log '^docker buildx build'
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 3
  no_mutation
}

# A registry outage must never become permission to overwrite a tag.
t_registry_errors_fail_closed() {
  local error args
  for error in 'ERROR: unexpected status from HEAD request: 401 Unauthorized' 'ERROR: failed to authorize: failed to fetch oauth token: 403 Forbidden' 'ERROR: failed to do request: dial tcp: lookup registry: no such host' 'ERROR: unexpected status: 500 Internal Server Error' 'ERROR: proxy: not found'; do
    EXTRA_ENV=("FAKE_INSPECT_ERROR=$error")
    for args in 'build gateway --yes' 'deploy all --yes --no-smoke' 'rollback gateway --tag old --yes --no-smoke'; do
      : >"$LOG"
      # shellcheck disable=SC2086 # intentional validated argument list splitting
      run_deploy "<EOF>" $args
      assert_rc 3
      no_mutation
    done
  done
}

t_recognized_manifest_missing_allows_build() {
  EXTRA_ENV=("FAKE_INSPECT_ERROR=ERROR: manifest unknown: Requested entity was not found.")
  run_deploy "<EOF>" build gateway --yes
  assert_rc 0
  assert_count 1 '^docker buildx build '
  : >"$LOG"
  run_deploy "<EOF>" deploy gateway --existing-tag old --yes --no-smoke
  assert_rc 3
  no_mutation
}

t_build_pushes_without_update() {
  run_deploy "sim" build gateway
  assert_rc 0
  assert_count 1 '^docker buildx build '
  assert_log "^docker buildx build .*--push.* -f $REPO/apps/gateway/Dockerfile .*-t southamerica-east1-docker.pkg.dev/$PROJECT/seguradora/gateway:abc1234 $REPO\$"
  refute_log '^gcloud run services update'
  refute_log '^terraform'
}

t_deploy_gateway_only_touches_gateway() {
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 0
  assert_count 1 '^docker buildx build '
  assert_log "^docker buildx build .* -f $REPO/apps/gateway/Dockerfile "
  assert_count 1 '^gcloud run services update '
  assert_log "^gcloud run services update gateway --image southamerica-east1-docker.pkg.dev/$PROJECT/seguradora/gateway:abc1234 --region southamerica-east1 --project $PROJECT\$"
  assert_log "^node $REPO/infra/smoke.mjs $SMOKE_URL_FROM_NUMBER\$"
  refute_log '^terraform'
  refute_log '^gcloud run deploy'
  if grep -v '^node ' "$LOG" | grep -qE "$OTHER_SERVICES_RE"; then fail "deploy gateway mentions another service"; fi
  # order: git -> docker build -> gcloud update -> node smoke
  local order
  order="$(grep -nE '^(git|docker buildx build|gcloud run services update|node)' "$LOG" | sed -E 's/^[0-9]+:([a-z]+).*/\1/' | uniq | tr '\n' ' ' || true)"
  [ "$order" = "git docker gcloud node " ] || fail "unexpected call order: $order"
  [ "$(tail -n 1 "$LOG" | cut -d' ' -f1)" = node ] || fail "smoke is not the last call"
  assert_out "gateway-00002-fak"
  assert_out "https://gateway-fake.a.run.app"
}

t_deploy_custom_domain_smoke_url() {
  write_env "WEB_CUSTOM_DOMAIN_URL=https://chat.example.com"
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 0
  assert_log '^node .*/infra/smoke.mjs https://chat.example.com$'
  run_deploy "<EOF>" deploy gateway --yes --url https://other.example.com
  assert_log '^node .*/infra/smoke.mjs https://other.example.com$'
}

t_deploy_no_smoke() {
  run_deploy "<EOF>" deploy gateway --yes --no-smoke
  assert_rc 0
  refute_log '^node '
}

t_deploy_smoke_failure_exit5() {
  EXTRA_ENV=("FAKE_NODE_EXIT=1")
  run_deploy "<EOF>" deploy gateway --yes
  assert_rc 5
  assert_out "smoke falhou — o serviço foi atualizado mesmo assim; use rollback se necessário"
  assert_count 1 '^gcloud run services update gateway '
}

t_svc_without_dockerfile_uses_fake() {
  run_deploy "<EOF>" deploy svc-cotacao --yes --no-smoke
  assert_rc 0
  assert_log "^docker buildx build .* -f $REPO/infra/fake-services/Dockerfile .*-t southamerica-east1-docker.pkg.dev/$PROJECT/seguradora/svc-cotacao:abc1234 $REPO\$"
  assert_out "AVISO: imagem FAKE"
  assert_count 1 '^gcloud run services update svc-cotacao '
}

t_svc_with_dockerfile_uses_it() {
  echo "FROM scratch" >"$REPO/apps/svc-cotacao/Dockerfile"
  run_deploy "<EOF>" deploy svc-cotacao --yes --no-smoke
  assert_rc 0
  assert_log "^docker buildx build .* -f $REPO/apps/svc-cotacao/Dockerfile "
  refute_log 'fake-services'
  refute_out "FAKE"
}

t_deploy_all_order_one_smoke() {
  run_deploy "<EOF>" deploy all --yes
  assert_rc 0
  local order
  order="$(grep '^gcloud run services update ' "$LOG" | cut -d' ' -f5 | tr '\n' ' ' || true)"
  [ "$order" = "svc-cotacao svc-apolice svc-sinistro chatbot gateway web " ] || fail "deploy all order: $order"
  assert_count 6 '^docker buildx build '
  assert_count 1 '^node '
  [ "$(tail -n 1 "$LOG" | cut -d' ' -f1)" = node ] || fail "smoke is not the last call"
  [ "$(grep -c 'AVISO: imagem FAKE' "$OUT" || true)" -ge 3 ] || fail "expected a FAKE warning per svc-*"
  refute_log '^terraform'
}

t_deploy_list_sorted_by_rank() {
  run_deploy "<EOF>" deploy web gateway svc-apolice --yes --no-smoke
  assert_rc 0
  local order
  order="$(grep '^gcloud run services update ' "$LOG" | cut -d' ' -f5 | tr '\n' ' ' || true)"
  [ "$order" = "svc-apolice gateway web " ] || fail "explicit list order: $order"
}

t_deploy_all_failure_stops() {
  EXTRA_ENV=("FAKE_GCLOUD_FAIL_SERVICE=chatbot")
  run_deploy "<EOF>" deploy all --yes
  [ "$RC" != 0 ] || fail "a failed chatbot update must fail the command"
  refute_log '^gcloud run services update (gateway|web) '
  refute_log '^docker buildx build .*/(gateway|web):'
  refute_log '^node '
  assert_out "falha em chatbot (gcloud run services update). Já atualizados: svc-cotacao svc-apolice svc-sinistro. Não tentados: gateway web."
}

t_confirmation_must_be_exact() {
  local answer
  for answer in "nao" "" "YES" "Sim" "sim " "<EOF>"; do
    : >"$LOG"
    run_deploy "$answer" deploy gateway
    assert_rc 4
    no_mutation
    : >"$LOG"
    run_deploy "$answer" infra apply
    assert_rc 4
    no_mutation
  done
  : >"$LOG"
  run_deploy "sim" deploy gateway --no-smoke
  assert_rc 0
  assert_count 1 '^gcloud run services update gateway '
}

t_rollback_verifies_then_updates() {
  EXTRA_ENV=("FAKE_IMAGE_EXISTS=1")
  run_deploy "<EOF>" rollback gateway --tag v0.9 --yes --no-smoke
  assert_rc 0
  assert_log "^docker buildx imagetools inspect southamerica-east1-docker.pkg.dev/$PROJECT/seguradora/gateway:v0.9\$"
  assert_log "^gcloud run services update gateway --image southamerica-east1-docker.pkg.dev/$PROJECT/seguradora/gateway:v0.9 "
  refute_log '^docker buildx build'
  refute_log '^terraform'
  local inspect update
  inspect="$(grep -n 'imagetools inspect' "$LOG" | head -n 1 | cut -d: -f1 || true)"
  update="$(grep -n 'run services update' "$LOG" | head -n 1 | cut -d: -f1 || true)"
  [ "$inspect" -lt "$update" ] || fail "image must be verified before the update"
  : >"$LOG"
  run_deploy "<EOF>" deploy gateway --existing-tag v0.9 --yes --no-smoke
  assert_rc 0
  refute_log '^docker buildx build'
  refute_log '^git status'
}

t_rollback_missing_image() {
  run_deploy "<EOF>" rollback gateway --tag v0.9 --yes
  assert_rc 3
  no_mutation
}

t_infra_plan_readonly() {
  local v
  run_deploy "<EOF>" infra plan
  assert_rc 0
  assert_log "^terraform -chdir=$REPO/infra/terraform init -input=false -backend-config=bucket=$PROJECT-tfstate -backend-config=prefix=seguradora\$"
  assert_log '^terraform .* plan '
  refute_log '^terraform .* apply'
  assert_out "Plan: 2 to add"
  refute_out "$SECRET_CANARY"
  grep -qF "TF_VAR_service_scaling=$DEFAULT_SCALING" "$STATE/tfvars.plan" || fail "service_scaling JSON (defaults) wrong: $(grep scaling "$STATE/tfvars.plan" || true)"
  for v in project_id region artifact_registry_repo log_level; do
    grep -q "^TF_VAR_$v=" "$STATE/tfvars.plan" || fail "TF_VAR_$v not exported"
  done
  if grep -v -E '^TF_VAR_(project_id|region|artifact_registry_repo|trust_proxy_hops|web_custom_domain_url|billing_account_id|budget_amount_brl|budget_alert_email|log_level|service_scaling)=' "$STATE/tfvars.plan" | grep -q .; then
    fail "unexpected TF_VAR_* exported: $(cat "$STATE/tfvars.plan")"
  fi
  local planfile
  planfile="$(plan_path)"
  [ ! -e "$(dirname "$planfile")" ] || fail "plan dir left behind after infra plan"
}

t_scaling_overrides_and_warning() {
  write_env "GATEWAY_MAX_INSTANCES=3" "WEB_MIN_INSTANCES=1" "WEB_MAX_INSTANCES=4" "WEB_MEMORY=1Gi" \
    "TRUST_PROXY_HOPS=2" "BUDGET_AMOUNT_BRL=150" "BILLING_ACCOUNT_ID=000000-000000-000000" \
    'BUDGET_ALERT_EMAIL="ops@example.com"'
  run_deploy "<EOF>" infra plan
  assert_rc 0
  grep -q 'AVISO.*gateway' "$OUT" || fail "no loud warning for gateway max_instances > 1"
  grep -qF 'TF_VAR_service_scaling={"web":{"min_instances":1,"max_instances":4,"memory":"1Gi"},"gateway":{"min_instances":0,"max_instances":3,"memory":"512Mi"},' "$STATE/tfvars.plan" ||
    fail "service_scaling overrides wrong: $(grep scaling "$STATE/tfvars.plan" || true)"
  grep -qx 'TF_VAR_trust_proxy_hops=2' "$STATE/tfvars.plan" || fail "trust_proxy_hops"
  grep -qx 'TF_VAR_budget_amount_brl=150' "$STATE/tfvars.plan" || fail "budget_amount_brl"
  grep -qx 'TF_VAR_budget_alert_email=ops@example.com' "$STATE/tfvars.plan" || fail "quoted value not unquoted"
}

t_infra_apply_saved_plan_success() {
  run_deploy "sim" infra apply
  assert_rc 0
  local planfile dir
  planfile="$(plan_path)"
  dir="$(dirname "$planfile")"
  case "$planfile" in "$REPO"/*) fail "plan file inside the repo: $planfile" ;; esac
  grep -q '^drwx------' "$STATE/plandir.ls" || fail "plan dir not mode 700: $(cat "$STATE/plandir.ls")"
  assert_log "^terraform -chdir=$REPO/infra/terraform apply -input=false $planfile\$"
  [ -f "$STATE/apply_saw_plan" ] || fail "apply did not receive the saved plan file"
  [ ! -e "$dir" ] || fail "plan dir not removed after success"
  assert_log '^terraform .* show -no-color '
  refute_out "$SECRET_CANARY"
  refute_log "$SECRET_CANARY"
  assert_out "Plan: 2 to add, 1 to change, 0 to destroy."
  assert_out "web_url"
}

t_infra_apply_no_changes() {
  EXTRA_ENV=("FAKE_TF_PLAN_EXIT=0")
  run_deploy "<EOF>" infra apply
  assert_rc 0
  refute_log '^terraform .* apply'
}

t_infra_apply_failure_cleans() {
  EXTRA_ENV=("FAKE_TF_APPLY_EXIT=1")
  run_deploy "<EOF>" infra apply --yes
  assert_rc 1
  local dir
  dir="$(dirname "$(plan_path)")"
  [ ! -e "$dir" ] || fail "plan dir not removed after a failed apply"
}

t_infra_apply_sigint_cleans() {
  EXTRA_ENV=("FAKE_TF_APPLY_SIGINT=1")
  run_deploy "<EOF>" infra apply --yes
  assert_rc 130
  local dir
  dir="$(dirname "$(plan_path)")"
  [ ! -e "$dir" ] || fail "plan dir not removed after SIGINT"
}

t_infra_apply_refuses_tmpdir_in_repo() {
  RUN_TMPDIR="$REPO/infra"
  run_deploy "<EOF>" infra apply --yes
  assert_rc 3
  refute_log '^terraform .* (plan|apply)'
}

# Terraform auto-loads these files from its working dir and they beat TF_VAR_*: refuse them
# before ANY terraform call, in every command that uses terraform.
TF_COMMANDS_STDIN="$PROJECT"
t_tf_autoloaded_var_files_refused() {
  local file args
  for file in terraform.tfvars terraform.tfvars.json local.auto.tfvars local.auto.tfvars.json; do
    echo 'project_id = "other-project"' >"$REPO/infra/terraform/$file"
    for args in "infra plan" "infra apply --yes" "status" "status gateway" "smoke" "bootstrap --yes" "destroy --confirm-project $PROJECT"; do
      : >"$LOG"
      # shellcheck disable=SC2086 # intentional validated argument list splitting
      run_deploy "$TF_COMMANDS_STDIN" $args
      assert_rc 3
      assert_out "infra/terraform/$file"
      assert_out "terraform.tfvars.example"
      refute_log '^terraform'
      no_mutation
    done
    # Commands that never call terraform are not affected.
    : >"$LOG"
    run_deploy "<EOF>" smoke --url https://x.example.com
    assert_rc 0
    run_deploy "<EOF>" deploy gateway --yes --no-smoke
    assert_rc 0
    refute_log '^terraform'
    rm -f "$REPO/infra/terraform/$file"
  done
}

t_tf_example_var_file_allowed() {
  echo 'project_id = "example"' >"$REPO/infra/terraform/terraform.tfvars.example"
  run_deploy "<EOF>" infra plan
  assert_rc 0
  assert_log '^terraform .* plan '
}

t_tf_inherited_workspace_and_cli_args_refused() {
  local var args
  for var in TF_WORKSPACE=other TF_CLI_ARGS=-var-file=/x.tfvars TF_CLI_ARGS_plan=-var=project_id=x; do
    EXTRA_ENV=("$var")
    for args in "infra plan" "status gateway" "destroy --confirm-project $PROJECT"; do
      : >"$LOG"
      # shellcheck disable=SC2086 # intentional validated argument list splitting
      run_deploy "$TF_COMMANDS_STDIN" $args
      assert_rc 3
      assert_out "${var%%=*}"
      refute_log '^terraform'
    done
  done
}

t_destroy_requires_matching_id() {
  run_deploy "$PROJECT" destroy
  assert_rc 2
  run_deploy "$PROJECT" destroy --confirm-project other-project-1
  assert_rc 4
  run_deploy "wrong-id" destroy --confirm-project "$PROJECT"
  assert_rc 4
  run_deploy "<EOF>" destroy --confirm-project "$PROJECT"
  assert_rc 4
  run_deploy "$PROJECT" destroy --confirm-project "$PROJECT" --yes
  assert_rc 2
  refute_log '^terraform .* destroy'
  run_deploy "$PROJECT" destroy --confirm-project "$PROJECT"
  assert_rc 0
  assert_count 1 '^terraform .* destroy '
  grep -qx "TF_VAR_project_id=$PROJECT" "$STATE/tfvars.destroy" || fail "destroy without TF_VAR_project_id"
  grep -qF "TF_VAR_service_scaling=$DEFAULT_SCALING" "$STATE/tfvars.destroy" || fail "destroy without service_scaling"
  refute_log 'buckets delete'
}

t_bootstrap_idempotent() {
  run_deploy "sim" bootstrap
  assert_rc 0
  assert_log "^gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project $PROJECT\$"
  assert_log "^gcloud auth application-default set-quota-project $PROJECT\$"
  assert_count 1 "^gcloud storage buckets create gs://$PROJECT-tfstate "
  assert_log "^gcloud storage buckets update gs://$PROJECT-tfstate .*--versioning"
  assert_log '^terraform .* init -input=false -backend-config=bucket='
  assert_log '^gcloud auth configure-docker southamerica-east1-docker.pkg.dev'
  : >"$LOG"
  EXTRA_ENV=("FAKE_BUCKET_EXISTS=1")
  run_deploy "<EOF>" bootstrap --yes
  assert_rc 0
  assert_log '^gcloud storage buckets describe '
  refute_log '^gcloud storage buckets create'
  refute_log 'delete'
  : >"$LOG"
  run_deploy "nao" bootstrap
  assert_rc 4
  no_mutation
}

t_smoke_command() {
  run_deploy "<EOF>" smoke --url https://x.example.com
  assert_rc 0
  assert_log '^node .*/infra/smoke.mjs https://x.example.com$'
  refute_log '^terraform'
  : >"$LOG"
  run_deploy "<EOF>" smoke
  assert_rc 0
  assert_log '^terraform .* output -raw web_url$'
  assert_log '^node .*/infra/smoke.mjs https://web-from-tf.example.run.app$'
  EXTRA_ENV=("FAKE_NODE_EXIT=1")
  run_deploy "<EOF>" smoke --url https://x.example.com
  assert_rc 5
  run_deploy "<EOF>" smoke --url ftp://x
  assert_rc 2
}

t_status() {
  run_deploy "<EOF>" status gateway
  assert_rc 0
  assert_log "^gcloud run services describe gateway --region southamerica-east1 --project $PROJECT "
  if grep -E '^gcloud' "$LOG" | grep -qE "$OTHER_SERVICES_RE"; then fail "status gateway described another service"; fi
  assert_out "web_url"
  : >"$LOG"
  run_deploy "<EOF>" status
  assert_rc 0
  assert_count 6 '^gcloud run services describe '
  no_mutation
}

# Failures must affect exit status while other readable results remain available.
t_status_describe_failure_retains_partial_results() {
  EXTRA_ENV=("FAKE_DESCRIBE_FAIL_SERVICE=chatbot")
  run_deploy "<EOF>" status
  assert_rc 1
  assert_count 6 '^gcloud run services describe '
  assert_out 'https://gateway-fake.a.run.app'
  assert_out 'web_url'
  no_mutation
}

t_status_tf_failures() {
  EXTRA_ENV=("FAKE_TF_INIT_EXIT=1")
  run_deploy "<EOF>" status gateway
  assert_rc 1
  assert_out 'https://gateway-fake.a.run.app'
  refute_log '^terraform .* output'
  : >"$LOG"
  EXTRA_ENV=("FAKE_TF_OUTPUT_EXIT=1")
  run_deploy "<EOF>" status gateway
  assert_rc 1
  assert_out 'https://gateway-fake.a.run.app'
  assert_log '^terraform .* output'
  no_mutation
}

t_no_secret_anywhere() {
  local args
  for args in "infra apply --yes" "infra plan" "status" "check" "deploy all --yes"; do
    # shellcheck disable=SC2086 # word splitting of the argument list is intended
    run_deploy "<EOF>" $args
    if grep -qF "$SECRET_CANARY" "$OUT" "$LOG"; then fail "secret canary leaked ($args)"; fi
  done
  assert_log '^terraform .* show '
}

# --- runner ------------------------------------------------------------------------------------
BASHES="/bin/bash"
for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
  if [ -x "$candidate" ]; then BASHES="$BASHES $candidate"; fi
done

SCENARIOS="$(declare -F | awk '{print $3}' | grep '^t_')"
TOTAL=0
for BASH_BIN in $BASHES; do
  # shellcheck disable=SC2016 # $BASH_VERSION must expand in the child bash, not here
  echo "== $BASH_BIN ($("$BASH_BIN" -c 'echo "$BASH_VERSION"'))"
  for scenario in $SCENARIOS; do
    CURRENT="$scenario"
    SCENARIO_FAILED=0
    TOTAL=$((TOTAL + 1))
    new_repo
    # `|| true`: a scenario is a list of assertions; errexit must not stop the suite midway.
    "$scenario" || true
    if [ "$SCENARIO_FAILED" = 0 ]; then echo "ok $scenario"; fi
  done
done

if [ "$FAILS" -ne 0 ]; then
  echo "FAIL deploy.test.sh: $FAILS assertion(s) failed"
  exit 1
fi
echo "PASS deploy.test.sh ($TOTAL scenario runs)"
