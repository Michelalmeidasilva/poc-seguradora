# infra/terraform

Terraform do deploy local do POC no Google Cloud Run (Plano 8). Em um projeto existente, cria APIs, Artifact Registry com limpeza de versões, VPC/sub-rede, seis contas de runtime, Secret Manager, seis serviços Cloud Run e orçamento opcional. O operador usa a própria identidade; não há deployer, WIF ou identidades de CI nesta stack. O fluxo completo está em [docs/deploy.md](../../docs/deploy.md).

## Configuração e estado

A configuração vem de `infra/.env`; `infra/deploy.sh` exporta `TF_VAR_*`. `terraform.tfvars.example` é somente uma referência dos tipos. As variáveis são `project_id` (obrigatória), `region` (`southamerica-east1`), `artifact_registry_repo` (`seguradora`), `trust_proxy_hops` (3), `log_level` (`info`), `web_custom_domain_url` (vazia), `billing_account_id` (vazia), `budget_amount_brl` (200), `budget_alert_email` (vazia) e `service_scaling`.

`service_scaling` é um mapa de objetos `{ min_instances, max_instances, memory }` com exatamente as chaves `web`, `gateway`, `chatbot`, `svc_cotacao`, `svc_apolice`, `svc_sinistro`. Padrão: mínimo 0 em todos; máximo 2 e memória 256Mi no web; máximo 1 e memória 512Mi nos demais. Gateway, chatbot e os serviços internos têm afinidade de sessão; estado em memória torna o limite de uma instância relevante. Alterar esse máximo exige avaliar a perda/divisão de sessões.

O backend `gcs` recebe bucket e prefixo no init, fora do código. O bucket privado, com versionamento e acesso uniforme, é criado pelo operador antes do init. Terraform não gerencia seu IAM. O estado contém o valor sensível de `SESSION_SECRET`; o script mantém planos em diretório temporário privado e os remove ao terminar.

## Infraestrutura e imagens

Terraform cria cada serviço com `us-docker.pkg.dev/cloudrun/container/hello`. A imagem é propriedade de `deploy.sh`: `ignore_changes` cobre `template[0].containers[0].image`, `client` e `client_version`, para que um apply posterior preserve imagens implantadas por gcloud. O placeholder permite criar a stack inteira antes de construir/publicar imagens; bootstrap com `-target` deixou de ser necessário. Depois do primeiro apply, implante as seis imagens pelo script antes do smoke funcional.

Todos escutam na porta 8080. O startup probe é TCP porque o placeholder não responde a `/health`. Probes HTTP de startup/liveness permanecem uma pendência até haver estratégia compatível com bootstrap e deploy independente.

`web` e `gateway` têm ingresso público e timeout de 3600s para SSE. `chatbot`, `svc-cotacao`, `svc-apolice`, `svc-sinistro` têm ingresso interno. Gateway e chatbot usam Direct VPC egress `ALL_TRAFFIC` na sub-rede `10.10.0.0/24`, com Private Google Access e sem NAT; os svc-* não precisam de egress. Só gateway mantém CPU fora das requisições e pode ler o secret `seguradora-session-secret`. As seis contas de runtime não recebem papéis no projeto.

Os seis invokers usam `allUsers`, conforme a decisão do Plano 7: os clientes ainda não enviam ID tokens Google. O ingresso interno controla o acesso aos quatro serviços internos. Autenticação por ID token e substituição dos respectivos bindings permanecem pendentes; políticas organizacionais que proíbem `allUsers` exigem tratamento pelo operador.

## URLs e ambiente

As URLs são computadas como `https://<serviço>-<número_do_projeto>.<região>.run.app`, evitando ciclo entre web e gateway. Web recebe `GATEWAY_URL`; gateway recebe `CHATBOT_URL`, `ALLOWED_ORIGIN` (domínio customizado ou URL do web), `SESSION_SECRET` via Secret Manager, cookies seguros, `TRUST_PROXY_HOPS` e `LOG_LEVEL`. Chatbot recebe `COTACAO_URL`, `APOLICE_URL`, `SINISTRO_URL` apontando aos respectivos svc-* e `LOG_LEVEL`. Cloud Run define `PORT`.

Outputs sem segredos: `web_url`, `gateway_url`, `computed_urls`, `service_uris`, `url_consistency_note`, `artifact_registry`. Compare URLs computadas com as servidas no primeiro deploy; o formato com hash pode aparecer em `service_uris`. O navegador usa web/nginx como origem para o proxy `/v1` e o cookie first-party.

## Contagens esperadas

Sem executar plan, derivamos as instâncias gerenciadas: 6 APIs (`run`, `artifactregistry`, `secretmanager`, `compute`, `iam`, `cloudresourcemanager`), 1 registry, 1 VPC, 1 sub-rede, 6 contas de runtime, 1 senha, 1 secret, 1 versão, 1 accessor, 6 serviços e 6 invokers: **31 recursos**. Com billing, somam-se API de budgets e orçamento: **33**. Com billing e e-mail, somam-se também API de monitoring e canal: **35**. `data.google_project` não entra na soma.

As contagens de blocos são diferentes das instâncias: há um bloco de APIs com `for_each` e blocos opcionais de budget/canal com `count`. `validate.sh` imprime ambos os critérios. Em migração de uma stack anterior, revise as remoções das identidades de CI e do serviço agregado; esta contagem descreve uma stack nova.

## Validação offline

Execute `bash infra/terraform/validate.sh`: fmt, init com backend desativado, validate e assertions estruturais por serviço. Não usa credenciais nem chama GCP; init pode baixar providers públicos. Terraform >= 1.10; providers google ~> 6.0 e random ~> 3.6, fixados no lock versionado.

Ingresso interno, roteamento VPC, URLs, cold start e `TRUST_PROXY_HOPS` exigem conferência no primeiro deploy real. Nenhum plan/apply foi executado nesta implementação.
