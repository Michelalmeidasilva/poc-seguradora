# Deploy do POC no Google Cloud Run (runbook)

Este runbook leva o POC (`web` → `gateway` → `chatbot` → `fake-services`) do zero até o Cloud Run, num projeto GCP seu, e mostra como operar, voltar versão e destruir tudo. Siga de cima para baixo. Nada disso foi executado a partir do repositório: o Terraform só foi validado offline (`infra/terraform/validate.sh`) e os workflows só passaram pelo `actionlint` (`infra/lint-workflows.sh`). O primeiro `apply` é seu.

Convenções:

- Todos os comandos rodam na **raiz do repositório** (o Terraform com `terraform -chdir=infra/terraform`).
- Troque cada `<PLACEHOLDER>` pelo seu valor: `<PROJECT_ID>` (id do projeto GCP), `<REGION>` (padrão `southamerica-east1`), `<TF_STATE_BUCKET>` (nome do bucket do estado), `<IMAGE_TAG>` (tag das imagens), `<OWNER>/<REPO>` (repositório GitHub), `<WEB_URL>` (output `web_url`), `<SEU_EMAIL>`, `<BILLING_ACCOUNT_ID>`.
- O repositório Docker se chama `seguradora` (variável `artifact_registry_repo`); se mudar, troque `seguradora` nos caminhos de imagem.
- Detalhes do Terraform (arquivos, papéis, contagem esperada no `plan`, outputs): [`infra/terraform/README.md`](../infra/terraform/README.md). Visão geral do `infra/`: [`infra/README.md`](../infra/README.md).

`node infra/check-runbook.mjs` (também `pnpm check:runbook`) confere que os caminhos, variáveis do Terraform, variáveis do GitHub e endereços `-target` citados aqui existem no repositório.

## Sumário

- [Checklist rápido](#checklist-rápido)
- [1. Pré-requisitos](#1-pré-requisitos)
- [2. Bootstrap (uma vez)](#2-bootstrap-uma-vez)
- [3. Primeiro apply](#3-primeiro-apply)
- [4. GitHub: environment, variáveis e WIF](#4-github-environment-variáveis-e-wif)
- [5. Primeiro deploy pelo workflow](#5-primeiro-deploy-pelo-workflow)
- [6. Smoke pós-deploy](#6-smoke-pós-deploy)
- [7. Validar ingress interno e Direct VPC egress](#7-validar-ingress-interno-e-direct-vpc-egress)
- [8. Verificar TRUST_PROXY_HOPS](#8-verificar-trust_proxy_hops)
- [9. Custos](#9-custos)
- [10. Rollback](#10-rollback)
- [11. Segurança](#11-segurança)
- [12. Limites conhecidos](#12-limites-conhecidos)
- [13. Destruição](#13-destruição)
- [14. Pendências](#14-pendências)

## Checklist rápido

- [ ] Ferramentas instaladas e projeto GCP com faturamento ativo ([1](#1-pré-requisitos)).
- [ ] `gcloud auth login` + `gcloud auth application-default login` com a sua conta ([2.1](#21-login)).
- [ ] APIs `cloudresourcemanager` e `serviceusage` habilitadas à mão ([2.2](#22-apis-mínimas)).
- [ ] Bucket do estado criado (privado, versionado, acesso uniforme) ([2.4](#24-bucket-do-estado)).
- [ ] `terraform.tfvars` preenchido (com `github_repository`) e `terraform init` com o bucket ([2.5](#25-terraformtfvars-e-init)).
- [ ] `apply -target` do Artifact Registry → push das quatro imagens → `apply` completo ([3](#3-primeiro-apply)).
- [ ] Deployer com `roles/storage.objectAdmin` no bucket (e `roles/billing.costsManager` se houver orçamento) ([3.5](#35-permissões-do-deployer-fora-do-terraform)).
- [ ] Smoke manual contra o `web_url` passa ([6](#6-smoke-pós-deploy)).
- [ ] GitHub: environment `production` com revisores, branches/tags restritas, variáveis do repositório e ruleset de tags `v*` ([4](#4-github-environment-variáveis-e-wif)).
- [ ] Primeiro deploy pelo workflow aprovado e smoke do workflow verde ([5](#5-primeiro-deploy-pelo-workflow)).
- [ ] Ingress interno + Direct VPC egress conferidos ([7](#7-validar-ingress-interno-e-direct-vpc-egress)) e `TRUST_PROXY_HOPS` verificado ([8](#8-verificar-trust_proxy_hops)).
- [ ] Orçamento e alertas conferidos ([9](#9-custos)); sabe como voltar versão ([10](#10-rollback)) e destruir ([13](#13-destruição)).

## 1. Pré-requisitos

- `gcloud` (Google Cloud CLI) atualizado.
- Terraform `>= 1.10`.
- Docker com `buildx` (Docker Desktop serve). Em Mac com Apple Silicon as imagens precisam ser `linux/amd64` (os comandos abaixo já pedem isso).
- Node 22 (smoke test) e `git`. O `gh` (GitHub CLI) é opcional, só para as variáveis do repositório.
- Um projeto GCP **existente** com conta de faturamento vinculada, em que a sua conta é `roles/owner` (ou tem papéis equivalentes para criar APIs, IAM, rede, Cloud Run, Secret Manager e Artifact Registry).
- Admin do repositório no GitHub (environments, variáveis e rulesets).
- Para o orçamento (opcional): permissão na conta de faturamento (`roles/billing.costsManager` ou administrador da conta).

Confira o faturamento:

```bash
gcloud billing projects describe <PROJECT_ID> --format='value(billingEnabled)'
```

Deve imprimir `True`.

## 2. Bootstrap (uma vez)

### 2.1 Login

O Terraform local usa as Application Default Credentials (ADC) da sua conta.

```bash
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud auth application-default login
```

Se a sua conta não for dona do projeto, um dono concede o papel:

```bash
gcloud projects add-iam-policy-binding <PROJECT_ID> --member="user:<SEU_EMAIL>" --role="roles/owner"
```

### 2.2 APIs mínimas

O Terraform habilita as APIs de que precisa (`google_project_service`), mas antes disso ele já lê o projeto (`data.google_project`, que usa a Cloud Resource Manager API) e o provider manda o projeto como projeto de cota (`user_project_override`, que exige a Service Usage API). Sem essas duas habilitadas, o primeiro `plan` falha com `SERVICE_DISABLED`. Habilite à mão:

```bash
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project=<PROJECT_ID>
gcloud auth application-default set-quota-project <PROJECT_ID>
```

### 2.3 Escolha a tag das primeiras imagens

As imagens são `<REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/{web,gateway,chatbot,fake-services}:<IMAGE_TAG>`. Para o bootstrap use uma tag que o workflow nunca vai gerar, por exemplo `bootstrap-1` (o workflow usa o SHA completo do commit ou a tag `v*`). Regra geral: **toda imagem construída ganha uma tag nova**; o workflow recusa construir numa tag que já existe no registro (ver [10](#10-rollback)). Depois do primeiro apply, o workflow pode implantar `bootstrap-1` de novo com `deploy_existing_tag`.

### 2.4 Bucket do estado

O estado do Terraform guarda o valor do `SESSION_SECRET` (é assim que o `random_password` funciona), então o bucket precisa ser privado (prevenção de acesso público), com versionamento (para recuperar um estado corrompido) e acesso uniforme no nível do bucket (sem ACLs por objeto). Ele **não** é gerenciado pelo Terraform: é criado aqui e apagado à mão na [destruição](#13-destruição).

```bash
gcloud storage buckets create gs://<TF_STATE_BUCKET> --project=<PROJECT_ID> --location=<REGION> --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://<TF_STATE_BUCKET> --versioning
```

O nome do bucket é global no GCS (ex.: `<PROJECT_ID>-tfstate`). A permissão do deployer no bucket vem depois do primeiro apply ([3.5](#35-permissões-do-deployer-fora-do-terraform)), porque é o apply que cria a conta `seguradora-deployer`.

### 2.5 terraform.tfvars e init

```bash
(cd infra/terraform && cp terraform.tfvars.example terraform.tfvars)
```

Edite o `terraform.tfvars` (ignorado pelo git; nunca versione). Mínimo para o fluxo completo com GitHub Actions:

```hcl
project_id        = "<PROJECT_ID>"
image_tag         = "bootstrap-1"
region            = "southamerica-east1"
github_repository = "<OWNER>/<REPO>"
# github_deploy_branch = "master"

# Orçamento (opcional; a conta de faturamento precisa estar em BRL):
# billing_account_id = "<BILLING_ACCOUNT_ID>"
# budget_amount_brl  = 200
# budget_alert_email = "<SEU_EMAIL>"
```

`github_repository` precisa ser igual ao `owner/nome` real do GitHub, **incluindo maiúsculas e minúsculas** (a condição do WIF compara texto exato). Para obter o valor exato: `gh repo view --json nameWithOwner -q .nameWithOwner`. Com a caixa diferente, o primeiro login do CI falha e o CI não consegue corrigir isso (só um apply local com o valor certo). Isso vale porque o workflow passa sempre `github_repository = github.repository`; se o primeiro apply for sem ele, o primeiro deploy pelo CI cria o WIF que ele mesmo precisaria para logar. Todas as variáveis estão em [`infra/terraform/README.md`](../infra/terraform/README.md#variáveis).

```bash
terraform -chdir=infra/terraform init -backend-config="bucket=<TF_STATE_BUCKET>" -backend-config="prefix=seguradora"
```

## 3. Primeiro apply

### 3.1 Por que em três etapas

Os serviços Cloud Run apontam para `<REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/<imagem>:<IMAGE_TAG>`. Criar um serviço cuja imagem não existe falha no apply (`Image ... not found`), e o repositório do Artifact Registry é criado por esta mesma stack. Então:

1. `apply -target` só do repositório (o `depends_on` dele traz junto as APIs);
2. push das quatro imagens a partir do seu computador;
3. `apply` completo.

Depois disso o workflow de deploy faz as duas coisas na ordem certa (push e depois Terraform).

### 3.2 Artifact Registry (e APIs)

```bash
terraform -chdir=infra/terraform apply -target=google_artifact_registry_repository.images
```

Confira o plano (as APIs `google_project_service.apis[...]` e o `google_artifact_registry_repository.images`) e responda `yes`. O aviso `Resource targeting is in effect` é esperado.

### 3.3 Push das quatro imagens

```bash
gcloud auth configure-docker <REGION>-docker.pkg.dev
docker buildx build --platform linux/amd64 --provenance=false --push -f apps/web/Dockerfile -t <REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/web:bootstrap-1 .
docker buildx build --platform linux/amd64 --provenance=false --push -f apps/gateway/Dockerfile -t <REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/gateway:bootstrap-1 .
docker buildx build --platform linux/amd64 --provenance=false --push -f apps/chatbot/Dockerfile -t <REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/chatbot:bootstrap-1 .
docker buildx build --platform linux/amd64 --provenance=false --push -f infra/fake-services/Dockerfile -t <REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/fake-services:bootstrap-1 .
```

O contexto é a raiz do repositório (o ponto final), igual ao CI e ao `infra/docker-compose.yml`. `--provenance=false` gera uma imagem simples de uma plataforma, como o workflow. Confira:

```bash
gcloud artifacts docker images list <REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora --include-tags
```

### 3.4 Apply completo

```bash
terraform -chdir=infra/terraform plan -out=tfplan
terraform -chdir=infra/terraform apply tfplan
```

No plan, confira o que o [`infra/terraform/README.md`](../infra/terraform/README.md#o-que-o-plan-deve-mostrar) lista: 40 recursos no cenário padrão (48 com WIF, orçamento e e-mail; o `-target` anterior já criou parte deles), nenhum `destroy`, `random_password.session_secret` e `secret_data` como `(sensitive value)`, `TRUST_PROXY_HOPS = "3"`, `ingress` interno em `chatbot` e `fake-services`.

Se o projeto estiver numa organização com a org policy `iam.allowedPolicyMemberDomains` (Domain Restricted Sharing), os bindings `allUsers` dos invokers falham (`One or more users named in the policy do not belong to a permitted customer`). Peça ao admin da organização uma exceção da política para este projeto e rode o apply de novo. Sem `allUsers` o produto não funciona: `web` e `gateway` são públicos, e `chatbot`/`fake-services` dependem do ingress interno porque ainda não há ID token entre serviços ([14](#14-pendências)).

Depois do apply:

```bash
terraform -chdir=infra/terraform output
curl -s "$(terraform -chdir=infra/terraform output -raw web_url)/health"
```

O `curl` deve imprimir `ok`. Compare `computed_urls` (o que foi injetado nas variáveis de ambiente) com `service_uris` (o que o Cloud Run informa; pode vir no formato com hash): as URLs computadas precisam responder (o output `url_consistency_note` explica).

> **Atenção: use sempre o `web_url`.** O Cloud Run serve o `web` em duas URLs: a determinística (`web-<número_do_projeto>.<região>.run.app`, a do output `web_url` e a usada em `ALLOWED_ORIGIN`) e a com hash, mostrada pelo console, por `gcloud run services list` e pelo output `service_uris`. O gateway só aceita a Origin igual a `ALLOWED_ORIGIN`; abrir a URL com hash faz `POST /v1/session` responder 403 e o chat parece quebrado, sem nenhum aviso. Abra o `web_url` (ou o domínio próprio); a outra URL responde 403 em `/v1` por desenho.

### 3.5 Permissões do deployer fora do Terraform

O deployer (`seguradora-deployer`, criado agora) precisa ler e gravar o estado. A permissão é dada no bucket, à mão, e não pela stack (com só `objectAdmin` ele não lê a política de IAM do bucket, e um binding gerenciado pela stack quebraria o refresh do `plan` no CI com 403):

```bash
gcloud storage buckets add-iam-policy-binding gs://<TF_STATE_BUCKET> \
  --member="serviceAccount:seguradora-deployer@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

Só se `billing_account_id` estiver preenchido (o orçamento): o deployer precisa gerenciar o orçamento na conta de faturamento, o que a stack não concede.

```bash
gcloud billing accounts add-iam-policy-binding <BILLING_ACCOUNT_ID> \
  --member="serviceAccount:seguradora-deployer@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/billing.costsManager"
```

(No seu apply local, quem cria o orçamento é a sua conta, que precisa do mesmo papel ou de administrador da conta de faturamento.)

## 4. GitHub: environment, variáveis e WIF

### 4.1 Environment `production`

Em **Settings > Environments > New environment**, nome `production`:

1. **Required reviewers**: pelo menos uma pessoa; marque **Prevent self-review**.
2. **Deployment branches and tags**: **Selected branches and tags**; adicione a regra de branch `master` (ou o valor de `github_deploy_branch`) e a regra de tag `v*`.
3. Não crie secrets: o workflow não usa nenhum.

Só o job `deploy` de `.github/workflows/deploy.yml` usa esse environment e só ele pede token OIDC (`id-token: write`).

### 4.2 Variáveis do repositório

Em **Settings > Secrets and variables > Actions > Variables** (variáveis, não secrets; nenhuma é sensível). Os nomes são exatamente os de `.github/workflows/deploy.yml`:

| Variável | Obrigatória | Valor |
|---|---|---|
| `GCP_WIF_PROVIDER` | sim | output `wif_provider` |
| `GCP_DEPLOYER_SA` | sim | output `deployer_service_account` |
| `GCP_PROJECT_ID` | sim | `<PROJECT_ID>` (`project_id`) |
| `GCP_REGION` | sim | `<REGION>` (`region`; também o host `<REGION>-docker.pkg.dev`) |
| `TF_STATE_BUCKET` | sim | `<TF_STATE_BUCKET>` (prefixo fixo `seguradora`) |
| `TF_VAR_ARTIFACT_REGISTRY_REPO` | não | `artifact_registry_repo` (padrão `seguradora`; também o caminho das imagens) |
| `TF_VAR_TRUST_PROXY_HOPS` | não | `trust_proxy_hops` (padrão 3; ver [8](#8-verificar-trust_proxy_hops)) |
| `TF_VAR_WEB_CUSTOM_DOMAIN_URL` | não | `web_custom_domain_url` |
| `TF_VAR_LOG_LEVEL` | não | `log_level` |
| `TF_VAR_BILLING_ACCOUNT_ID` | não | `billing_account_id` |
| `TF_VAR_BUDGET_AMOUNT_BRL` | não | `budget_amount_brl` |
| `TF_VAR_BUDGET_ALERT_EMAIL` | não | `budget_alert_email` |
| `TF_VAR_GITHUB_DEPLOY_BRANCH` | não | `github_deploy_branch` (padrão `master`; igual à regra de branch do environment) |

As opcionais só são exportadas quando têm valor; vazias, vale o padrão do Terraform. **Use os mesmos valores do seu `terraform.tfvars`**: o CI aplica o que tem, então uma variável que existe no `tfvars` e falta aqui é revertida no próximo deploy (por exemplo, o orçamento seria apagado). `deploy_fake_services` e `service_urls` não passam pelo workflow (ver [12](#12-limites-conhecidos)).

Com o `gh` (logado no repositório):

```bash
gh variable set GCP_WIF_PROVIDER --body "$(terraform -chdir=infra/terraform output -raw wif_provider)"
gh variable set GCP_DEPLOYER_SA --body "$(terraform -chdir=infra/terraform output -raw deployer_service_account)"
gh variable set GCP_PROJECT_ID --body "<PROJECT_ID>"
gh variable set GCP_REGION --body "<REGION>"
gh variable set TF_STATE_BUCKET --body "<TF_STATE_BUCKET>"
```

Opcionais, só as que você mudou no `tfvars`, por exemplo:

```bash
gh variable set TF_VAR_BILLING_ACCOUNT_ID --body "<BILLING_ACCOUNT_ID>"
gh variable set TF_VAR_BUDGET_ALERT_EMAIL --body "<SEU_EMAIL>"
```

Se `wif_provider` sair vazio, o apply foi feito sem `github_repository`: preencha no `tfvars` e rode o [apply completo](#34-apply-completo) de novo.

### 4.3 Ruleset das tags `v*`

Um push de tag `v*` dispara o deploy usando o arquivo de workflow **da tag**. Quem pode criar tags pode, portanto, rodar uma versão editada do workflow. A aprovação do environment e a condição do WIF (`environment == production`) continuam valendo, mas esse é o caminho mais fraco. Restrinja quem cria tags `v*`:

**Settings > Rules > Rulesets > New ruleset > New tag ruleset**: nome `release-tags`, enforcement **Active**, target **Include by pattern** `v*`, regras **Restrict creations**, **Restrict updates** e **Restrict deletions**; em **Bypass list** só os mantenedores que fazem release.

### 4.4 Como o WIF autoriza (e como falha)

O provider `github-actions` do pool `github` (`infra/terraform/iam.tf`) só aceita tokens OIDC do GitHub que satisfaçam **ao mesmo tempo**:

- `assertion.repository == "<OWNER>/<REPO>"` (`github_repository`);
- `attribute.environment == "production"` (o job roda no environment, ou seja, passou pela aprovação);
- `assertion.ref == "refs/heads/<github_deploy_branch>"` **ou** `assertion.ref` começando com `refs/tags/v`.

E o deployer só pode ser personificado por `principalSet://.../attribute.repository/<OWNER>/<REPO>`.

Falhas típicas no passo `google-github-actions/auth` do job `deploy`:

- `failed to generate Google Cloud federated token ... "error":"unauthorized_client","error_description":"The given credential is rejected by the attribute condition."`: o token não satisfaz a condição (workflow disparado de outra branch, tag sem `v`, job sem `environment: production`, `github_repository` diferente do repositório real ou `TF_VAR_GITHUB_DEPLOY_BRANCH`/regra do environment diferentes do `github_deploy_branch` aplicado).
- `Permission 'iam.serviceAccounts.getAccessToken' denied`: falta o binding `roles/iam.workloadIdentityUser` (apply sem `github_repository`) ou `GCP_DEPLOYER_SA` está errado.
- `invalid_target` / pool ou provider não encontrado: `GCP_WIF_PROVIDER` errado (deve ser o nome completo `projects/<número>/locations/global/workloadIdentityPools/github/providers/github-actions`).

**Não verificado:** o mapeamento `"attribute.environment" = "has(assertion.environment) ? assertion.environment : \"\""` foi escrito para não falhar em jobs sem environment, mas nunca rodou contra o GCP. Se o apply do provider rejeitar a expressão, ou se o login falhar com erro de mapeamento mesmo no job `deploy`, troque em `infra/terraform/iam.tf` por `"attribute.environment" = "assertion.environment"` (o único job que pede token tem environment; jobs sem ele passam a ser rejeitados no mapeamento, o que também é seguro) e aplique localmente.

## 5. Primeiro deploy pelo workflow

O workflow `deploy` (`.github/workflows/deploy.yml`) roda em dois casos:

- **Actions > deploy > Run workflow** (workflow_dispatch) na branch de deploy, com `image_tag` opcional (vazio = SHA do commit) e `deploy_existing_tag` (padrão desmarcado; marcado = não constrói e implanta imagens que já existem na tag, ver [10](#10-rollback));
- push de uma tag `v*` (a tag vira a `image_tag`).

Sequência: o job `deploy` espera a aprovação do environment `production`; depois valida a tag, confere que o commit é alcançável a partir da branch padrão do repositório, faz login no GCP pelo WIF, confere a tag no registro (modo build: recusa se já existir; `deploy_existing_tag`: exige as quatro imagens), constrói e envia as quatro imagens com a tag (só no modo build), e roda `terraform init`, `plan` e `apply`. O job `smoke` (sem credenciais) roda `infra/smoke.mjs` contra o `web_url`.

Para o primeiro deploy, rode o workflow manualmente com `image_tag` vazio (a tag será o SHA, diferente de `bootstrap-1`), aprove e acompanhe.

**A aprovação acontece antes do plan.** O revisor aprova o job inteiro sem ver o plano do Terraform (o plano só é calculado depois da aprovação, e o `apply` vem logo em seguida, sem nova pausa). Para mudanças arriscadas (variáveis do Terraform, `.tf` alterados), rode o plano localmente com os mesmos valores antes de aprovar:

```bash
terraform -chdir=infra/terraform plan -var image_tag=<IMAGE_TAG>
```

Se a branch de deploy não for a branch padrão do repositório, o passo "Only deploy commits reachable from the default branch" recusa commits que ainda não estão na padrão.

## 6. Smoke pós-deploy

O job `smoke` do workflow roda sozinho. Para rodar do seu computador:

```bash
node infra/smoke.mjs "$(terraform -chdir=infra/terraform output -raw web_url)"
```

> **Atenção:** passe ao smoke e abra no navegador o `web_url` (ou o domínio próprio), nunca a URL com hash do console, do `gcloud run services list` ou de `service_uris`: o gateway responde 403 em `/v1` para qualquer Origin diferente de `ALLOWED_ORIGIN`, por desenho.

Saída esperada: `ok web`, `ok session`, `ok stream`, `ok chatbot`, `ok demo-flow`, `ok quote`, `ok replay`. Uma falha imprime `FAIL <hop>: <motivo>` e sai com código 1:

| Hop | O que falhou |
|---|---|
| `web` | `GET /` não respondeu 200 com HTML e CSP: serviço `web`, imagem ou URL |
| `session` | `POST /v1/session` pelo proxy do nginx: `GATEWAY_URL`, gateway fora, `ALLOWED_ORIGIN` diferente da origem do web (403) |
| `sse` | stream `/v1/stream` ou replay com `Last-Event-ID` |
| `chatbot` | gateway → chatbot (ver [7](#7-validar-ingress-interno-e-direct-vpc-egress)) |
| `services` | chatbot → fake-services (ver [7](#7-validar-ingress-interno-e-direct-vpc-egress)) |

Cada passo tem 10 s. No primeiro acesso depois de muito tempo parado, o cold start de três serviços em cadeia pode estourar esse prazo: rode de novo uma vez antes de investigar.

## 7. Validar ingress interno e Direct VPC egress

Não dá para testar offline: o primeiro apply e o smoke são a validação. `chatbot` e `fake-services` têm `ingress = INGRESS_TRAFFIC_INTERNAL_ONLY`; `gateway` e `chatbot` chegam neles por Direct VPC egress (`egress = ALL_TRAFFIC`) na sub-rede `seguradora-run`, que tem Private Google Access.

Sintomas de falha:

- gateway → chatbot bloqueado: o smoke para em `FAIL chatbot`; no chat, a mensagem de indisponibilidade aparece (o gateway publica um evento `error` com código `upstream_unavailable`); nos logs do gateway, erros de conexão ou respostas 403/404 do chatbot.
- chatbot → fake-services bloqueado: `FAIL services`; nos logs do chatbot, erros ao chamar `COTACAO_URL`/`APOLICE_URL`/`SINISTRO_URL`.

Conferências:

```bash
gcloud run services describe chatbot --region=<REGION> --project=<PROJECT_ID> --format=yaml | grep -E 'run.googleapis.com/(ingress|network-interfaces|vpc-access-egress)'
gcloud run services describe gateway --region=<REGION> --project=<PROJECT_ID> --format=yaml | grep -E 'run.googleapis.com/(ingress|network-interfaces|vpc-access-egress)'
gcloud run services describe fake-services --region=<REGION> --project=<PROJECT_ID> --format=yaml | grep -E 'run.googleapis.com/ingress'
gcloud compute networks subnets describe seguradora-run --region=<REGION> --project=<PROJECT_ID> --format='value(privateIpGoogleAccess)'
```

Esperado: `chatbot` e `fake-services` com ingress `internal`; `gateway` com ingress `all`; `gateway` e `chatbot` com `network-interfaces` na `seguradora-vpc`/`seguradora-run` e `vpc-access-egress: all-traffic`; a sub-rede com `True`.

As URLs injetadas:

```bash
gcloud run services describe gateway --region=<REGION> --project=<PROJECT_ID> --format='yaml(spec.template.spec.containers[0].env)'
gcloud run services describe chatbot --region=<REGION> --project=<PROJECT_ID> --format='yaml(spec.template.spec.containers[0].env)'
```

`CHATBOT_URL` e os `*_URL` devem bater com `computed_urls` e responder. Do seu computador, o chatbot **não** pode responder 200 (prova de que o ingress interno vale):

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$(terraform -chdir=infra/terraform output -json computed_urls | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).chatbot))')/health"
```

Logs:

```bash
gcloud run services logs read gateway --region=<REGION> --project=<PROJECT_ID> --limit=100
gcloud run services logs read chatbot --region=<REGION> --project=<PROJECT_ID> --limit=100
```

No Logs Explorer: `resource.type="cloud_run_revision" AND resource.labels.service_name="gateway" AND severity>=WARNING`.

## 8. Verificar TRUST_PROXY_HOPS

O gateway usa `TRUST_PROXY_HOPS` (variável `trust_proxy_hops`, padrão 3) para achar o IP do cliente no `X-Forwarded-For` e aplicar os limites por IP (eventos e criação de sessão). O caminho previsto é: cliente → front end do Google → nginx no Cloud Run (`web`) → front end do Google → gateway. Cada salto confiável acrescenta um endereço; com 3, o gateway ignora os 3 últimos e usa o anterior (o IP real do cliente). Um valor maior confia em entradas que o cliente pode forjar; um valor menor faz todos os clientes parecerem o mesmo IP do Google (e dividirem o mesmo limite).

**Os logs da aplicação do gateway nunca têm o IP do cliente** (privacidade: `REQUEST_LOG_SERIALIZERS` em `apps/gateway/src/compose.ts` loga só método e URL). Os IPs que existem estão nos logs de requisição do Cloud Run (`httpRequest.remoteIp`):

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="web" AND logName="projects/<PROJECT_ID>/logs/run.googleapis.com%2Frequests"' --project=<PROJECT_ID> --limit=10 --format='table(timestamp,httpRequest.remoteIp,httpRequest.status,httpRequest.requestUrl)'
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gateway" AND logName="projects/<PROJECT_ID>/logs/run.googleapis.com%2Frequests"' --project=<PROJECT_ID> --limit=10 --format='table(timestamp,httpRequest.remoteIp,httpRequest.status,httpRequest.requestUrl)'
```

No `web`, o `remoteIp` deve ser o seu IP público (veja em `curl -s https://api.ipify.org`); no `gateway`, um endereço do Google (a saída do `web`), o que confirma o salto extra. Mesma coisa no Logs Explorer com `logName="projects/<PROJECT_ID>/logs/run.googleapis.com%2Frequests" AND resource.labels.service_name="gateway"`.

Teste do valor, pelo limite de criação de sessão (5 por IP, recarga de 5 por minuto). Rode do seu computador, com entradas forjadas diferentes a cada chamada:

```bash
for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: <WEB_URL>' -H "X-Forwarded-For: 203.0.113.$i" <WEB_URL>/v1/session; done
```

- `201` cinco vezes e depois `429`: o gateway ignorou a entrada forjada e usou o seu IP. Correto (ou baixo demais; veja o próximo teste).
- `201` sete vezes: o gateway usou a entrada forjada; `TRUST_PROXY_HOPS` está **alto demais**. Diminua 1 e repita.

Logo depois do `429` (antes de 1 minuto), abra o `<WEB_URL>` de outra rede (celular no 4G, sem Wi-Fi) e comece uma conversa. Se a sessão falhar (limite atingido), todos os clientes estão caindo no mesmo IP do Google: o valor está **baixo demais**; aumente 1 e repita os dois testes.

Para mudar: ajuste `trust_proxy_hops` no `terraform.tfvars` **e** a variável `TF_VAR_TRUST_PROXY_HOPS` do repositório, e faça um deploy (workflow) ou um apply local:

```bash
terraform -chdir=infra/terraform apply -var image_tag=<IMAGE_TAG> -var trust_proxy_hops=<N>
```

(`<IMAGE_TAG>` = a tag em produção; ver [10](#10-rollback) para descobrir.)

**Limite aceito no POC:** o gateway também é público. Quem chama a URL do gateway direto (sem passar pelo `web`) tem menos saltos na frente, então as entradas forjadas do `X-Forwarded-For` caem na janela confiável e o limite por IP pode ser contornado. O gateway continua exigindo `Origin` permitido, cookie de sessão e os limites por sessão. Fechar isso (gateway só acessível pelo `web`, ou Cloud Armor) está nas [pendências](#14-pendências).

## 9. Custos

- **Orçamento:** com `billing_account_id`, um `google_billing_budget` mensal em BRL (`budget_amount_brl`, padrão 200) avisa em 50%, 90%, 100% e 100% previsto; os administradores da conta de faturamento recebem sempre, e `budget_alert_email` acrescenta um e-mail. **Orçamento só avisa, não corta gastos.** Confira em **Faturamento > Orçamentos e alertas**.
- **Instâncias:** todos os serviços escalam a zero (`min_instance_count = 0`); máximo 1 para `gateway`, `chatbot` e `fake-services` (o estado é em memória) e 2 para o `web`.
- **O gasto principal é o gateway com `cpu_idle = false`:** a CPU fica alocada (e cobrada) durante toda a vida da instância, não só nas requisições, porque as conexões SSE e os heartbeats rodam fora do tempo de requisição. Enquanto houver uma aba aberta com o chat, a conexão SSE mantém a instância viva (o stream reconecta a cada no máximo 3600 s). Feche as abas quando não estiver usando.
- **Artifact Registry:** a política de limpeza mantém as 10 versões mais recentes de cada imagem e apaga as outras com mais de 30 dias.
- Para conferir o que está rodando:

```bash
gcloud run services list --region=<REGION> --project=<PROJECT_ID>
gcloud run services describe gateway --region=<REGION> --project=<PROJECT_ID> --format=yaml | grep -E 'autoscaling.knative.dev/maxScale|cpu-throttling'
```

Para parar de gastar de vez: [destruição](#13-destruição).

## 10. Rollback

Imagens no Artifact Registry têm tags **mutáveis**: reconstruir e enviar com uma tag já publicada sobrescreveria a tag, o Terraform veria o mesmo `image_tag` e não criaria revisão nova, e num rollback futuro aquela tag apontaria para outro código. Por isso o workflow garante **uma tag nova para toda imagem construída**:

- **Modo build** (padrão: push de tag `v*` e Run workflow com `deploy_existing_tag` desmarcado): antes de construir, o job confere o registro e **recusa** a tag se qualquer uma das quatro imagens já existir nela (`tag ... already exists in the registry`). Use outra tag.
- **Modo `deploy_existing_tag`** (só Run workflow, input booleano): **não constrói nada**; primeiro confere que `web`, `gateway`, `chatbot` e `fake-services` existem na tag (senão falha com `images missing at tag ...`) e depois roda o Terraform **atual** (o da branch em que o workflow roda) com `image_tag` = essa tag, com a mesma aprovação do environment `production`.

Descubra a tag em produção e as anteriores:

```bash
gcloud run services describe gateway --region=<REGION> --project=<PROJECT_ID> --format='value(spec.template.spec.containers[0].image)'
gcloud artifacts docker images list <REGION>-docker.pkg.dev/<PROJECT_ID>/seguradora/gateway --include-tags --sort-by=~UPDATE_TIME --limit=10
```

As imagens antigas ficam no registro enquanto estiverem entre as 10 versões mais recentes de cada imagem (ou tiverem menos de 30 dias).

Opções, na ordem de preferência:

1. **Workflow com `deploy_existing_tag` (recomendado).** Em **Actions > deploy > Run workflow**, na branch de deploy, preencha `image_tag` = `<TAG_ANTERIOR>` e marque `deploy_existing_tag`. Aprove no environment. Sem rebuild, com a aprovação e com a configuração **atual** do Terraform: só as imagens voltam; recursos, IAM e variáveis de ambiente continuam como estão na branch. Com o `gh`:

   ```bash
   gh workflow run deploy.yml --ref master -f image_tag=<TAG_ANTERIOR> -f deploy_existing_tag=true
   ```

2. **Apply local com a tag anterior (alternativa).** Mesmo efeito, sem rebuild, mas exige as credenciais de dono do projeto e **não passa pela aprovação** do environment. Use quando o GitHub Actions não estiver disponível:

   ```bash
   terraform -chdir=infra/terraform apply -var image_tag=<TAG_ANTERIOR>
   ```

   Use o mesmo `terraform.tfvars` que espelha as variáveis do repositório.

3. **Reverter o commit** na branch de deploy e fazer um deploy normal (modo build, tag nova = novo SHA).

4. **Workflow a partir de uma tag `v*` antiga: cuidado.** Em "Use workflow from" escolher a tag `v<ANTERIOR>` faz o job usar o código **e** o `infra/terraform/*.tf` **e** o `.github/workflows/deploy.yml` daquela tag, aplicados sobre o estado atual. Isso **volta a infraestrutura junto com as imagens**: pode apagar ou reverter recursos, IAM e variáveis de ambiente criados depois, e uma condição de WIF antiga pode até bloquear os próximos deploys. Só use se não houver diferença na infraestrutura:

   ```bash
   git diff v<ANTERIOR> -- infra/terraform .github/workflows/deploy.yml
   ```

   A saída precisa ser vazia. Mesmo assim o modo build recusa uma tag que já exista: com `image_tag` vazio a tag é o SHA daquele commit, e se ele já foi publicado o job falha (use a opção 1 com essa tag). Na prática, esta opção só serve quando as imagens antigas já saíram do registro.

### Re-executar um run `v*` que falhou

- Se as quatro imagens (`web`, `gateway`, `chatbot`, `fake-services`) já foram enviadas ao registro com a tag, não reconstrua: dispare o workflow na branch de deploy com `image_tag=<vX.Y.Z>` e `deploy_existing_tag=true`:

  ```bash
  gh workflow run deploy.yml --ref master -f image_tag=<vX.Y.Z> -f deploy_existing_tag=true
  ```

- Se só algumas foram enviadas, use uma tag nova (por exemplo `vX.Y.Z-r1`), porque o modo build recusa uma tag que já exista no registro.

Em emergência, `gcloud run services update-traffic gateway --to-revisions=<REVISAO>=100 --region=<REGION> --project=<PROJECT_ID>` move o tráfego na hora, mas o próximo apply volta ao estado do Terraform; use só para ganhar tempo.

## 11. Segurança

- **URL pública sem login.** Qualquer pessoa com o `web_url` usa o chat. As proteções são do gateway: `ALLOWED_ORIGIN` (só a origem do web), cookie de sessão `Secure`/`SameSite=Lax`, limites por IP e por sessão e limite de sessões em memória (`apps/gateway/src/config.ts`). Os dados são do `fake-services`, não de clientes reais.
- **Credenciais:** nenhuma chave de conta de serviço; o GitHub usa WIF ([4.4](#44-como-o-wif-autoriza-e-como-falha)). O deployer tem papéis que permitem escalar privilégio dentro do projeto (gerencia IAM), por isso o WIF exige o environment com aprovação.
- **Estado do Terraform** contém o `SESSION_SECRET`: o bucket fica privado e só você e o deployer acessam.
- **Rotação do `SESSION_SECRET`.** Gera um novo valor, uma nova versão do secret e uma nova revisão do gateway. **Todas as sessões são perdidas** (os cookies antigos deixam de valer; o usuário recomeça a conversa).

  ```bash
  terraform -chdir=infra/terraform apply -replace=random_password.session_secret -var image_tag=<IMAGE_TAG>
  ```

  (`terraform taint random_password.session_secret` seguido de `apply` é o equivalente antigo.) Use a tag em produção para não trocar as imagens junto.

- **Org policy:** Domain Restricted Sharing bloqueia os invokers `allUsers` ([3.4](#34-apply-completo)).

## 12. Limites conhecidos

- **Estado em memória.** `gateway` e `chatbot` guardam sessões, buffers e turnos em memória, por isso no máximo 1 instância cada, com afinidade de sessão. Uma instância reciclada (escala a zero, novo deploy, manutenção do Cloud Run) perde todas as sessões; o usuário recomeça.
- **`fake-services` é um placeholder** dos serviços internos (cotação, apólice, sinistro) até os `svc-*` reais existirem. Ele implementa o contrato com dados falsos.
- **Trocar pelos serviços reais:** `deploy_fake_services = false` e `service_urls` no `terraform.tfvars` (os endereços precisam ser alcançáveis pela VPC; não há NAT, então não há saída para a internet):

  ```hcl
  deploy_fake_services = false
  service_urls = {
    cotacao  = "https://<COTACAO_HOST>"
    apolice  = "https://<APOLICE_HOST>"
    sinistro = "https://<SINISTRO_HOST>"
  }
  ```

  Hoje essas duas variáveis **não passam pelo workflow** (ele usa os padrões, com o `fake-services` ligado): um apply local com elas é revertido no próximo deploy pelo CI. Antes de trocar, ligue-as no `.github/workflows/deploy.yml` como as outras `TF_VAR_*` ([14](#14-pendências)).
- **Duas URLs do `web`.** Use sempre o `web_url` (ou o domínio próprio). A URL com hash do console, do `gcloud run services list` e de `service_uris` responde 403 em `/v1` por desenho, porque o gateway só aceita a Origin de `ALLOWED_ORIGIN`; um domínio próprio exige atualizar `ALLOWED_ORIGIN` para ele.
- **URLs computadas.** As variáveis de ambiente usam `https://<serviço>-<número_do_projeto>.<região>.run.app`; se o Cloud Run do projeto não servir esse formato, o smoke falha em `session` ou `chatbot` ([3.4](#34-apply-completo)).
- **Cold start** em cadeia (web → gateway → chatbot → fake-services) no primeiro acesso.

## 13. Destruição

Apaga tudo o que o Terraform criou (serviços, secret, rede, contas de serviço, WIF, orçamento e o repositório Docker com as imagens):

```bash
terraform -chdir=infra/terraform destroy -var image_tag=<IMAGE_TAG>
```

Confira a lista antes do `yes`. Se a sub-rede falhar com "resource is in use", é o Direct VPC egress ainda liberando os IPs dos serviços apagados: espere (pode levar algumas horas) e rode o `destroy` de novo.

O que **não** sai com o `destroy`, e como limpar:

- O bucket do estado (inclui versões antigas do estado, com o `SESSION_SECRET`):

  ```bash
  gcloud storage rm --recursive --all-versions gs://<TF_STATE_BUCKET>
  ```

- O papel do deployer na conta de faturamento (se concedeu):

  ```bash
  gcloud billing accounts remove-iam-policy-binding <BILLING_ACCOUNT_ID> \
    --member="serviceAccount:seguradora-deployer@<PROJECT_ID>.iam.gserviceaccount.com" \
    --role="roles/billing.costsManager"
  ```

- As APIs continuam habilitadas (`disable_on_destroy = false`, para não quebrar outras coisas do projeto).
- O pool WIF `github` fica 30 dias em soft delete: recriar com o mesmo id nesse período falha (restaure o pool ou use `terraform import`).
- No GitHub: o environment `production`, as variáveis do repositório e o ruleset (apague à mão se não for usar mais).

Para apagar o projeto inteiro (some com tudo, inclusive o bucket): `gcloud projects delete <PROJECT_ID>`.

## 14. Pendências

- **Primeiro apply e primeiro deploy reais:** validar no GCP o ingress interno com Direct VPC egress, `TRUST_PROXY_HOPS`, o formato de URL computado e o cold start ([7](#7-validar-ingress-interno-e-direct-vpc-egress), [8](#8-verificar-trust_proxy_hops)).
- **Mapeamento do WIF** `has(assertion.environment) ? ... : ""` não verificado; fallback `assertion.environment` ([4.4](#44-como-o-wif-autoriza-e-como-falha)).
- **Autenticação entre serviços com ID token** do Cloud Run (gateway → chatbot, chatbot → serviços), trocando os `allUsers` dos serviços internos por `roles/run.invoker` da conta chamadora. Hoje o controle é só o ingress interno.
- **`svc-*` reais** no lugar do `fake-services`; ligar `deploy_fake_services`/`service_urls` no workflow.
- **Domínio próprio, Cloud Armor/WAF e uptime checks** com alertas; fechar o acesso direto ao gateway (limite por IP contornável, [8](#8-verificar-trust_proxy_hops)).
- **Gateway `/v1/media`** (upload de voz e de mídia de Flows).
- **Próxima tela decidida pelo servidor** depois de `data_exchange` (hoje a web avança de forma otimista).
- **Validar os Flows** (cotação e demo) no Playground da Meta.
- **Fixar versões das imagens base** (`node:22-slim`, `nginx`) por digest e a imagem do `actionlint` (`rhysd/actionlint:latest`, sem versão) usada por `infra/lint-workflows.sh`.
- **Proteção de tags `v*`** ([4.3](#43-ruleset-das-tags-v)) é manual; o workflow não consegue verificar que o ruleset existe.
