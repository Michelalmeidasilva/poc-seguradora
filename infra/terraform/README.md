# infra/terraform

Terraform do deploy do POC no Google Cloud Run (Plano 7). Cria, num projeto GCP existente: APIs, repositório Docker no Artifact Registry, VPC + sub-rede para o Direct VPC egress, contas de serviço com privilégio mínimo, o `SESSION_SECRET` no Secret Manager, os quatro serviços Cloud Run (`web`, `gateway`, `chatbot`, `fake-services`), o Workload Identity Federation do GitHub Actions (opcional) e um alerta de orçamento (opcional).

Nada aqui foi aplicado: neste repositório o Terraform só passa por `fmt`, `init -backend=false` e `validate` (`./validate.sh`). O primeiro `apply` é feito pelo operador com a própria conta, seguindo o runbook (`docs/deploy.md`).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `versions.tf` | Terraform `>= 1.10`, `hashicorp/google ~> 6.0`, `hashicorp/random ~> 3.6`, backend `gcs` parcial, provider com `user_project_override` (a API de Budgets exige projeto de cota) |
| `variables.tf` | Variáveis (todas com descrição, tipo e validação quando cabe) |
| `main.tf` | `data.google_project`, `locals` (imagens, URLs computadas), APIs, Artifact Registry (mantém as 10 versões mais recentes de cada imagem; apaga as outras com mais de 30 dias) |
| `network.tf` | VPC `seguradora-vpc` e sub-rede `seguradora-run` (`10.10.0.0/24`, `private_ip_google_access = true`, sem Cloud NAT) |
| `iam.tf` | Contas de serviço, papéis do deployer, WIF do GitHub |
| `secrets.tf` | `random_password` (48 caracteres) → secret `seguradora-session-secret`; só a conta do gateway pode ler |
| `run.tf` | Os quatro serviços Cloud Run e os invokers |
| `budget.tf` | Orçamento mensal em BRL e canal de e-mail (só com `billing_account_id`) |
| `outputs.tf` | URLs e nomes; nenhum valor secreto |
| `validate.sh` | Validação offline (ver abaixo) |
| `.terraform.lock.hcl` | Versões exatas dos providers (gerado pelo `init`, versionado) |

## Backend (estado)

O backend é `gcs` com configuração parcial: o bucket não fica no repositório.

```bash
terraform init -backend-config="bucket=<TF_STATE_BUCKET>" -backend-config="prefix=seguradora"
```

O estado guarda o valor do `SESSION_SECRET` (é assim que o `random_password` funciona), então o bucket precisa ser privado, com versionamento e acesso uniforme. O bucket é criado no bootstrap do runbook, não por este Terraform.

## Variáveis

| Variável | Padrão | Uso |
|---|---|---|
| `project_id` | (obrigatória) | Projeto GCP |
| `image_tag` | (obrigatória) | Tag das quatro imagens (SHA do commit ou tag de release) |
| `region` | `southamerica-east1` | Região de tudo |
| `artifact_registry_repo` | `seguradora` | Repositório Docker. Imagens: `<region>-docker.pkg.dev/<project>/<repo>/{web,gateway,chatbot,fake-services}:<image_tag>` |
| `trust_proxy_hops` | `3` | `TRUST_PROXY_HOPS` do gateway (cliente → front end do Google → nginx do web → front end do Google → gateway). Conferir nos logs do gateway no primeiro deploy |
| `log_level` | `info` | `LOG_LEVEL` do gateway e do chatbot |
| `web_custom_domain_url` | `""` | URL pública do web com domínio próprio (`https://host`, sem barra no fim); vira o `ALLOWED_ORIGIN` do gateway |
| `deploy_fake_services` | `true` | Sobe o `fake-services` enquanto os `svc-*` reais não existem |
| `service_urls` | `null` | `{ cotacao, apolice, sinistro }`: obrigatório com `deploy_fake_services = false`. Precisam ser alcançáveis pela VPC (não há NAT, logo não há saída para a internet) |
| `github_repository` | `""` | `owner/nome` autorizado a fazer deploy via WIF. Vazio = sem WIF |
| `tf_state_bucket` | `""` | Bucket do estado; quando preenchido, o deployer ganha `roles/storage.objectAdmin` nele |
| `billing_account_id` | `""` | Conta de faturamento para o orçamento. Vazio = sem orçamento |
| `budget_amount_brl` | `200` | Valor mensal (a moeda da conta de faturamento precisa ser BRL). Alertas em 50%, 90%, 100% e 100% previsto |
| `budget_alert_email` | `""` | E-mail extra dos alertas (canal do Cloud Monitoring); os administradores da conta de faturamento recebem sempre |

Copie `terraform.tfvars.example` para `terraform.tfvars` (ignorado pelo git) e preencha.

## Serviços Cloud Run

| Serviço | Ingress | Instâncias | Afinidade | Timeout | CPU fora de requisição | Egress | Probes |
|---|---|---|---|---|---|---|---|
| `web` | público | 0–2 | não | 3600s (SSE) | não | padrão | HTTP `/health` |
| `gateway` | público | 0–1 | sim | 3600s (SSE) | sim (`cpu_idle = false`) | Direct VPC, `ALL_TRAFFIC` | HTTP `/health` |
| `chatbot` | interno | 0–1 | sim | 300s (padrão) | não | Direct VPC, `ALL_TRAFFIC` | HTTP `/health` |
| `fake-services` | interno | 0–1 | sim | 300s (padrão) | não | padrão | TCP no startup; liveness em `GET /v1/sinistros/SN-2001` (o fake não tem `/health`) |

`gateway` e `chatbot` guardam sessão e turnos em memória: duas instâncias dividiriam as sessões, por isso máximo 1. Instância reciclada perde as sessões (limite conhecido do POC).

Variáveis de ambiente (o Cloud Run define `PORT=8080`):

- `web`: `GATEWAY_URL` = URL do gateway (sem caminho).
- `gateway`: `CHATBOT_URL` = URL do chatbot; `SESSION_SECRET` via `secret_key_ref` (versão fixada; uma nova versão gera nova revisão); `ALLOWED_ORIGIN` = URL pública do web; `COOKIE_SECURE=true`; `COOKIE_SAME_SITE=lax`; `TRUST_PROXY_HOPS` = `var.trust_proxy_hops`; `LOG_LEVEL` = `var.log_level`.
- `chatbot`: `COTACAO_URL`, `APOLICE_URL`, `SINISTRO_URL` = URL do `fake-services` (ou `service_urls`); `LOG_LEVEL`.

O navegador só fala com o `web` (o nginx faz proxy de `/v1` para o gateway), então o cookie de sessão é first-party mesmo com URLs diferentes.

### URLs sem ciclo

As URLs usadas nas variáveis de ambiente são computadas no formato determinístico do Cloud Run v2, `https://<serviço>-<número_do_projeto>.<região>.run.app`, a partir de `data.google_project.project.number`. Ler o atributo `uri` criaria um ciclo (`web` precisa da URL do gateway e o gateway precisa da URL do web como origem). Os outputs `computed_urls` (o que foi injetado) e `service_uris` (o `uri` que o Cloud Run informa, que pode vir no outro formato, com hash) permitem comparar depois do apply; `url_consistency_note` explica a conferência.

### Invokers e autenticação entre serviços

- `web` e `gateway`: `allUsers` (públicos).
- `chatbot` e `fake-services`: também `allUsers` no IAM, porque hoje o gateway e o chatbot **não enviam ID token do Google**; um invoker por conta de serviço responderia 403. O controle de acesso deles é o ingress interno: só tráfego vindo da VPC do projeto (Direct VPC egress + Private Google Access) chega neles.
- Se o projeto tiver a org policy `iam.allowedPolicyMemberDomains` (Domain Restricted Sharing), os bindings `allUsers` falham no apply; é preciso uma exceção para o projeto.

**Pendência:** autenticação gateway → chatbot e chatbot → serviços com ID token do Cloud Run (`Authorization: Bearer` com audiência = URL do serviço chamado), trocando os `allUsers` dos dois serviços internos por `roles/run.invoker` só para a conta de serviço chamadora. Exige mudança no código do gateway e do chatbot (cliente HTTP com token do metadata server).

## Contas de serviço e papéis

| Conta | Papéis |
|---|---|
| `seguradora-web`, `seguradora-chatbot`, `seguradora-fake-services` | nenhum (o Cloud Run escreve logs do stdout e baixa imagens do mesmo projeto com o próprio service agent) |
| `seguradora-gateway` | `roles/secretmanager.secretAccessor` só no secret `seguradora-session-secret` |
| `seguradora-deployer` | no projeto: `roles/run.admin`, `roles/artifactregistry.admin`, `roles/secretmanager.admin`, `roles/compute.networkAdmin`, `roles/iam.serviceAccountAdmin`, `roles/iam.workloadIdentityPoolAdmin`, `roles/resourcemanager.projectIamAdmin`, `roles/serviceusage.serviceUsageAdmin` e, com orçamento + e-mail, `roles/monitoring.notificationChannelEditor`; `roles/iam.serviceAccountUser` só nas quatro contas de runtime; `roles/storage.objectAdmin` no bucket do estado (com `tf_state_bucket`) |

O deployer precisa de `projectIamAdmin` e `serviceAccountAdmin` porque este Terraform gerencia bindings de IAM; na prática isso permite escalar privilégios dentro do projeto. Por isso o WIF só aceita tokens deste repositório e de `main`, tags `v*` ou do environment `production` (com aprovação). Papéis na conta de faturamento (orçamento: `roles/billing.costsManager`) não são concedidos aqui: o operador concede manualmente se o deploy pelo CI tiver orçamento.

WIF (com `github_repository`): pool `github`, provider `github-actions` (issuer `https://token.actions.githubusercontent.com`), `attribute_condition` = repositório igual a `github_repository` **e** (`ref == refs/heads/main` ou `ref` começando com `refs/tags/v` ou `environment == production`); o deployer aceita `principalSet://.../attribute.repository/<owner>/<repo>`. Pools apagados ficam 30 dias em soft delete: recriar com o mesmo id nesse período falha (use `terraform import` ou restaure o pool).

## O que o plan deve mostrar

Não é possível rodar `terraform plan` sem credenciais, então a conferência no primeiro plan é manual. Os blocos por tipo estão em `validate.sh` (última seção); as instâncias esperadas, por cenário:

| Tipo | Padrão¹ | Com tudo² | Observação |
|---|---|---|---|
| `google_project_service` | 8 | 10 | + `billingbudgets` e `monitoring` |
| `google_artifact_registry_repository` | 1 | 1 | |
| `google_compute_network` | 1 | 1 | |
| `google_compute_subnetwork` | 1 | 1 | |
| `google_service_account` | 5 | 5 | |
| `google_project_iam_member` | 8 | 9 | + `monitoring.notificationChannelEditor` |
| `google_service_account_iam_member` | 4 | 5 | actAs ×4; + `workloadIdentityUser` |
| `google_storage_bucket_iam_member` | 0 | 1 | |
| `google_iam_workload_identity_pool` | 0 | 1 | |
| `google_iam_workload_identity_pool_provider` | 0 | 1 | |
| `random_password` | 1 | 1 | |
| `google_secret_manager_secret` | 1 | 1 | |
| `google_secret_manager_secret_version` | 1 | 1 | |
| `google_secret_manager_secret_iam_member` | 1 | 1 | |
| `google_cloud_run_v2_service` | 4 | 4 | |
| `google_cloud_run_v2_service_iam_member` | 4 | 4 | |
| `google_monitoring_notification_channel` | 0 | 1 | |
| `google_billing_budget` | 0 | 1 | |
| **Total** | **40** | **49** | |

¹ Só `project_id` e `image_tag`. ² `github_repository`, `tf_state_bucket`, `billing_account_id` e `budget_alert_email` preenchidos. Com `deploy_fake_services = false`, tire 2 (serviço `fake-services` e o invoker dele).

No primeiro plan, confira também: nenhum `destroy`; `random_password.session_secret` e `secret_data` aparecem como `(sensitive value)`; os `env` têm as URLs no formato `https://<serviço>-<número>.<região>.run.app`; `TRUST_PROXY_HOPS = "3"`; `ingress` interno em `chatbot` e `fake-services`.

## Outputs

| Output | Como usar |
|---|---|
| `web_url` | URL pública do produto; alvo do smoke (`node infra/smoke.mjs "$(terraform output -raw web_url)"`) |
| `gateway_url` | URL pública do gateway (computada). O navegador não usa; serve para diagnóstico (`curl <gateway_url>/health`) |
| `computed_urls` | As URLs injetadas nas variáveis de ambiente |
| `service_uris` | O `uri` real de cada serviço segundo o Cloud Run; compare com `computed_urls` |
| `url_consistency_note` | Texto com a conferência a fazer depois do apply |
| `artifact_registry` | Prefixo para `docker push <artifact_registry>/<imagem>:<tag>` |
| `deployer_service_account` | Variável `GCP_DEPLOYER_SA` do GitHub |
| `wif_provider` | Variável `GCP_WIF_PROVIDER` do GitHub (vazio sem `github_repository`) |

Nenhum output contém o `SESSION_SECRET` ou outro valor sensível (`validate.sh` confere).

## Validação offline

```bash
infra/terraform/validate.sh
```

Roda `terraform fmt -check -recursive`, `terraform init -backend=false -input=false` e `terraform validate` (sem credenciais; baixa os providers do registry público) e confere: outputs sem referência a segredo; nenhum valor de segredo literal nos `.tf` e a versão do secret alimentada pelo `random_password`; `.gitignore` cobrindo `*.tfvars`, estado, `.terraform/` e crash logs (e não o exemplo nem o lock); descrição e tipo em toda variável; contagem de blocos por tipo; e as regras do plano por serviço (instâncias, afinidade, timeout, ingress, egress, `cpu_idle`, `secret_key_ref`, `trust_proxy_hops`, sub-rede). Compatível com o bash 3.2 do macOS.

O que não dá para verificar offline (fica para o primeiro apply + smoke): ingress interno com Direct VPC egress de fato roteando, `TRUST_PROXY_HOPS`, o formato de URL computado batendo com o servido, cold start, org policies do projeto.
