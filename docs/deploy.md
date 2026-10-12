# Deploy local por serviço — Plano 8

Runbook do operador, executado na raiz do repositório. A infraestrutura é do Terraform; as imagens são implantadas independentemente por `infra/deploy.sh`. As verificações locais usam ferramentas falsas e validação offline. **Nenhum deploy real foi feito no GCP**: URLs, ingresso interno, Direct VPC egress, cold start e contagem de proxies continuam pendentes de validação pelo operador.

## Pré-requisitos

Projeto GCP existente, faturamento ativo e acesso da sua conta de operador. Instale Terraform >= 1.10, Google Cloud CLI, Docker com buildx e daemon ativo, Git, Node 22 e pnpm. O script constrói para linux/amd64, inclusive em Apple Silicon. Não usa chaves de conta de serviço; o login interativo e as ADC são da pessoa operadora.

```bash
gcloud auth login
gcloud auth application-default login
cp infra/.env.example infra/.env
```

Edite o arquivo copiado com seu projeto e bucket; valores de exemplo são recusados. Confira o faturamento no console. Os comandos abaixo só devem ser executados contra o projeto que você escolheu.

### Papéis do operador

Peça ao administrador as permissões necessárias; Terraform não concede papéis à sua identidade. Este conjunto de papéis predefinidos cobre as operações da stack sem exigir Owner; um papel personalizado pode restringir as permissões por recurso. A suficiência no projeto e as políticas da organização **ainda não foram verificadas em execução real**.

| Escopo | Papel | Uso |
| --- | --- | --- |
| Projeto | `roles/browser` | Ler projeto e número usado nas URLs |
| Projeto | `roles/serviceusage.serviceUsageAdmin` | Habilitar APIs; inclui uso de cotas pelas ADC |
| Projeto | `roles/run.admin` | Criar/alterar/excluir serviços e definir seus invocadores |
| Projeto | `roles/artifactregistry.admin` | Criar repositório, políticas de limpeza e publicar/consultar imagens |
| Projeto | `roles/compute.networkAdmin` | Criar rede/sub-rede e configurar Private Google Access |
| Projeto | `roles/iam.serviceAccountAdmin` | Criar/excluir as seis identidades de runtime |
| Nas seis contas de runtime | `roles/iam.serviceAccountUser` | Associar a identidade ao serviço (`actAs`); no primeiro apply, conceder no projeto para as contas ainda inexistentes |
| Projeto | `roles/secretmanager.admin` | Criar secret/versões e dar acesso somente ao gateway |
| Projeto no bootstrap | `roles/storage.admin` | Criar/endurecer o bucket privado do estado |
| Bucket depois do bootstrap | `roles/storage.objectAdmin` | Ler/gravar/gerenciar estado e lock do Terraform; manter Storage Admin se repetir bootstrap |
| Conta de faturamento, só com orçamento | `roles/billing.costsManager` | Criar/gerenciar orçamento |
| Projeto, só com e-mail extra do orçamento | `roles/monitoring.notificationChannelEditor` | Criar canal de notificação |

Referências oficiais: [Cloud Run IAM](https://cloud.google.com/run/docs/reference/iam/roles), [Service Usage](https://cloud.google.com/iam/docs/roles-permissions/serviceusage), [papéis IAM](https://cloud.google.com/iam/docs/roles-overview). Os agentes de serviço do Google também precisam manter seus papéis gerenciados; Direct VPC egress depende do acesso à rede pelo agente do Cloud Run. Não remova essas concessões.

## Configuração

`infra/.env` é ignorado pelo Git e pelo contexto Docker. O formato é `CHAVE=valor`, uma chave por linha, comentários em linhas próprias; o arquivo é lido e nunca executado. Chaves desconhecidas são erro. Vazio usa os padrões do Terraform, exceto projeto/bucket obrigatórios nos comandos que os consomem. `--env-file` escolhe outro arquivo. Não imprima, versione ou compartilhe o arquivo, estado, plano salvo ou segredo.

| Chave | Padrão / significado |
| --- | --- |
| `PROJECT_ID` | Obrigatório: id real do projeto |
| `REGION` | southamerica-east1 |
| `TF_STATE_BUCKET` | Obrigatório para bootstrap, infra, status/outputs, smoke sem URL e destroy; nome global do bucket |
| `ARTIFACT_REGISTRY_REPO` | seguradora |
| `LOG_LEVEL` | info; gateway/chatbot: fatal, error, warn, info, debug, trace, silent |
| `TRUST_PROXY_HOPS` | 3; inteiro não negativo, verificar no primeiro deploy |
| `WEB_CUSTOM_DOMAIN_URL` | Vazio: URL computada do Cloud Run; se preenchido, https://host sem barra final e domínio já mapeado |
| `BILLING_ACCOUNT_ID` | Vazio: sem orçamento; conta deve usar BRL |
| `BUDGET_AMOUNT_BRL` | 200, quando vazio; orçamento mensal positivo |
| `BUDGET_ALERT_EMAIL` | Vazio: somente administradores da conta; preenchido cria canal extra |
| `WEB_MIN_INSTANCES` | 0 |
| `WEB_MAX_INSTANCES` | 2 |
| `WEB_MEMORY` | 256Mi |
| `GATEWAY_MIN_INSTANCES` | 0 |
| `GATEWAY_MAX_INSTANCES` | 1 |
| `GATEWAY_MEMORY` | 512Mi |
| `CHATBOT_MIN_INSTANCES` | 0 |
| `CHATBOT_MAX_INSTANCES` | 1 |
| `CHATBOT_MEMORY` | 512Mi |
| `SVC_COTACAO_MIN_INSTANCES` | 0 |
| `SVC_COTACAO_MAX_INSTANCES` | 1 |
| `SVC_COTACAO_MEMORY` | 512Mi |
| `SVC_APOLICE_MIN_INSTANCES` | 0 |
| `SVC_APOLICE_MAX_INSTANCES` | 1 |
| `SVC_APOLICE_MEMORY` | 512Mi |
| `SVC_SINISTRO_MIN_INSTANCES` | 0 |
| `SVC_SINISTRO_MAX_INSTANCES` | 1 |
| `SVC_SINISTRO_MEMORY` | 512Mi |

MIN/MAX são inteiros, MAX >= 1 e MAX >= MIN; memória é um inteiro positivo com Mi ou Gi. Gateway, chatbot e serviços internos guardam estado em memória; MAX > 1 gera aviso porque uma sessão pode cair em outra instância. Afinidade não garante persistência. MIN=0 reduz custo, mas introduz cold start.

O script exporta `TF_VAR_project_id`, `TF_VAR_region`, `TF_VAR_artifact_registry_repo`, `TF_VAR_log_level`, `TF_VAR_trust_proxy_hops`, `TF_VAR_web_custom_domain_url`, `TF_VAR_billing_account_id`, `TF_VAR_budget_amount_brl`, `TF_VAR_budget_alert_email` e `TF_VAR_service_scaling`. A última é um JSON com chaves web, gateway, chatbot, svc_cotacao, svc_apolice, svc_sinistro e campos min_instances, max_instances, memory. `TF_STATE_BUCKET` configura o backend, não uma variável Terraform. Fonte de padrões: [variables.tf](../infra/terraform/variables.tf). A configuração do fluxo é só este arquivo, e o script garante isso: descarta qualquer outro `TF_VAR_*` herdado do shell e recusa (exit 3, antes de qualquer chamada ao Terraform em `bootstrap`, `infra plan|apply`, `status`, `smoke` sem `--url` e `destroy`) os arquivos que o Terraform carrega automaticamente em `infra/terraform` e que teriam precedência sobre os `TF_VAR_*` — `terraform.tfvars`, `terraform.tfvars.json`, `*.auto.tfvars` e `*.auto.tfvars.json` — e as variáveis herdadas `TF_WORKSPACE` e `TF_CLI_ARGS*`. Se você criou um `terraform.tfvars` nesse diretório seguindo o runbook do Plano 7, remova ou renomeie (passe os valores para `infra/.env`); `terraform.tfvars.example` é permitido.

## Primeiro deploy

Árvore Git limpa e configuração preenchida. Cada ação mutável mostra o alvo e pede `sim` exato; leia antes de confirmar. O bootstrap é repetível: habilita as duas APIs iniciais, define o quota project das ADC, cria o bucket se faltar, aplica versionamento/acesso uniforme/prevenção de acesso público, inicializa o backend GCS e configura autenticação Docker.

```bash
bash infra/deploy.sh check
bash infra/deploy.sh bootstrap
bash infra/deploy.sh infra apply
bash infra/deploy.sh deploy all
bash infra/deploy.sh status
```

O primeiro apply cria seis serviços com a imagem pública placeholder `us-docker.pkg.dev/cloudrun/container/hello`, portanto ainda não precisa de imagens no seu registro. Não teste o produto antes de `deploy all`: placeholder não implementa a aplicação nem o `/health` esperado. Probes atuais são TCP na porta 8080. Não é necessário apply parcial para criar o repositório.

`deploy all` atualiza nesta ordem: svc-cotacao → svc-apolice → svc-sinistro → chatbot → gateway → web. Faz smoke uma vez no final. Falha interrompe a sequência e informa quais serviços já foram atualizados; não há rollback automático nem transação entre eles. Em atualização parcial, avalie compatibilidade e reverta individualmente se necessário.

O plano salvo fica em diretório temporário privado, modo 700, fora do repositório, removido no sucesso, erro e Ctrl-C. `infra apply` mostra o plano mascarado e aplica exatamente o plano confirmado; não abra nem arquive o plano binário ou sua representação integral, pois contêm segredo. `infra plan` descarta o plano; o apply seguinte gera outro e pede confirmação novamente.

### URLs e validação inicial

Cloud Run pode exibir uma URI com hash e a URL determinística com número do projeto. Use o output **web_url** para abrir o navegador, Origin/cookies e smoke; compare computed_urls com service_uris exibidos no apply/status. Duas URLs diferentes podem ser válidas; ainda é preciso confirmar que a URL computada responde. `WEB_CUSTOM_DOMAIN_URL` também vira ALLOWED_ORIGIN, mas configurar a chave não cria domínio/certificado.

Com o valor de web_url copiado do output:

```bash
curl -fsS https://SEU_HOST_WEB/health
bash infra/deploy.sh smoke --url https://SEU_HOST_WEB
```

Não continue se URLs ou smoke falharem. Após um deploy de imagem, rode `bash infra/deploy.sh infra plan`: esperamos nenhuma alteração de imagem nem client/client_version (ignorados no Terraform); esse comportamento é verificado estruturalmente, **ainda não no GCP**.

## Deploy por serviço

Uma invocação altera somente a imagem do serviço indicado; usa `gcloud run services update --image`, sem Terraform. Mantém configuração, rede e escala. Cada comando constrói/publica a imagem e roda smoke no fim:

```bash
bash infra/deploy.sh deploy web
bash infra/deploy.sh deploy gateway
bash infra/deploy.sh deploy chatbot
bash infra/deploy.sh deploy svc-cotacao
bash infra/deploy.sh deploy svc-apolice
bash infra/deploy.sh deploy svc-sinistro
```

A tag padrão é o SHA curto do commit. Uma tag existente é recusada antes de construir/publicar: faça um commit novo ou use tag nova. Se a imagem do mesmo commit já foi publicada para este serviço, reutilize-a com `--existing-tag`; não tente reconstruir por cima. Build sem implantação e deploy de imagem publicada:

```bash
bash infra/deploy.sh build gateway --tag release-001
bash infra/deploy.sh deploy gateway --existing-tag release-001
```

### Histórico de build e deploy

Cada `build`, `deploy` e `rollback` acrescenta uma linha por serviço em [infra/deploy-history.md](../infra/deploy-history.md): data (UTC), serviço, ação, tag (versão), commit, branch, versão do `package.json` do app, imagem (própria ou FAKE), tempo de build e de deploy em segundos, revisão do Cloud Run, resultado (inclui `falha: build/push` e `falha: update`), projeto, região e operador. Execuções canceladas na confirmação não gravam nada. O script não faz commit: depois de um deploy, rode `git add infra/deploy-history.md` e commite. O arquivo não conta como árvore suja para o próximo deploy. O tempo do smoke não entra na tabela.

### Alterações de configuração

Edite `infra/.env` para escala, memória, LOG_LEVEL, proxies ou domínio e execute:

```bash
bash infra/deploy.sh infra plan
bash infra/deploy.sh infra apply
```

Variáveis de ambiente dos serviços são gerenciadas pelo Terraform; as demais configurações de aplicação estão em `infra/terraform/run.tf` e nos schemas dos apps. Se precisar alterá-las, faça a mudança de infraestrutura revisada e use plan/apply. Um deploy de imagem não aplica mudanças do `.env`; rollback de imagem também não restaura configuração anterior.

### Imagens FAKE e serviços reais

Sem Dockerfile próprio, cada svc usa `infra/fake-services/Dockerfile` e imprime **AVISO: imagem FAKE**. O fake implementa os três contratos, mas cada Cloud Run tem imagem/tag e instância independentes. Não são serviços de negócio reais. Convenção para o dono da outra frente: criar o arquivo `Dockerfile` dentro de `apps/svc-cotacao`, `apps/svc-apolice` ou `apps/svc-sinistro` (a convenção apps/ + svc-X/Dockerfile, X é cotacao, apolice ou sinistro), build com contexto na raiz, escutar em 8080 e responder GET /health. Basta adicionar o Dockerfile do serviço para o script escolher a imagem real. Não edite caminhos de outro dono; veja [WORKBOARD](../WORKBOARD.md) e [contratos](superpowers/specs/2026-10-10-internal-services-contracts.md).

### Comandos e flags

```bash
bash infra/deploy.sh help
pnpm run infra:deploy help
```

`help` e `--help` funcionam sem configuração nem ferramentas. `status` consulta imagem, revisão, URL e outputs; aceita serviço. `check` valida ferramentas, daemon, login, ADC e configuração sem alterar a nuvem.

| Flag | Uso |
| --- | --- |
| `--tag` | Tag nova em build/deploy; tag publicada em rollback |
| `--existing-tag` | Deploy de imagem publicada, verificando existência; sem build |
| `--allow-dirty` | Permite build/deploy com alterações locais; tag padrão inclui SHA, dirty e horário |
| `--no-smoke` | Pula smoke final de deploy/rollback; operador assume a verificação manual |
| `--url` | URL pública explícita para smoke, inclusive o final do deploy/rollback |
| `--env-file` | Outro arquivo de configuração |
| `--yes` | Dispensa apenas a confirmação sim; agentes só usam com autorização explícita no pedido atual |
| `--confirm-project` | Id obrigatório no destroy; ainda exige id digitado |
| `--help` | Ajuda |

Saídas: 0 sucesso; 1 erro externo/outro; 2 uso/configuração; 3 pré-condição (ferramenta, árvore suja, tag/imagem); 4 cancelado por confirmação; 5 smoke falhou. Ao falhar, pare, informe o código e o estado parcialmente atualizado; não repita mutações às cegas.

## Rollback

Escolha tag ainda existente no registro e confirme. O comando verifica a imagem antes de atualizar, não constrói e não roda Terraform. Mesmo fluxo para cada serviço:

```bash
bash infra/deploy.sh rollback web --tag release-anterior
bash infra/deploy.sh rollback gateway --tag release-anterior
bash infra/deploy.sh rollback chatbot --tag release-anterior
bash infra/deploy.sh rollback svc-cotacao --tag release-anterior
bash infra/deploy.sh rollback svc-apolice --tag release-anterior
bash infra/deploy.sh rollback svc-sinistro --tag release-anterior
```

Substitua release-anterior pela tag real **de cada serviço**; tags não precisam coincidir. Confira compatibilidade com contratos/configuração atuais e rode smoke. Limpeza do registro mantém as dez versões mais recentes por imagem e remove versões antigas com mais de 30 dias; tag removida não pode ser usada no rollback.

## Smoke

```bash
bash infra/deploy.sh smoke
bash infra/deploy.sh smoke --url https://SEU_HOST_WEB
```

Sem URL, o comando lê web_url do Terraform. O smoke final de deploy/rollback resolve URL sem Terraform: flag, domínio configurado ou URL determinística do web pelo número do projeto. Use `--url` quando precisar fixar a mesma URL confirmada no output.

Sete passos: web, session, stream, chatbot, demo-flow, quote, replay. Verifica navegador/mesma origem → web/nginx → gateway → chatbot → serviços. Limite de 10 s por passo e 55 s global; cold start pode excedê-lo. No primeiro deploy ou após scale-to-zero, espere serviços prontos e repita somente o smoke se o diagnóstico indicar aquecimento. Não conclua que rede/autenticação funcionam só porque o placeholder sobe.

Para conferir localmente (não acessa GCP):

```bash
pnpm compose:up
node infra/smoke.mjs http://localhost:8080
pnpm compose:down
```

### Ingress interno e Direct VPC egress

Terraform configura web/gateway públicos; chatbot e os três serviços internos recebem somente ingress interno. Gateway/chatbot têm Direct VPC egress ALL_TRAFFIC na sub-rede com Private Google Access, sem Cloud NAT. Todos recebem invocador allUsers por decisão da POC; restrição de ingresso é a barreira dos internos, ainda sem autenticação por ID token.

No primeiro deploy real, confira no console/YAML dos serviços: ingress dos quatro internos, egress/sub-rede de gateway/chatbot, e Private Google Access. De fora da VPC, GET /health dos quatro internos deve ser bloqueado (resposta de bloqueio pode variar); pela web pública, o smoke deve completar, inclusive quote. Compare URLs com outputs antes de atribuir a falha à rede. Teste depois de cold start também. **Este percurso não foi validado no GCP.** Egress ALL_TRAFFIC sem NAT não oferece saída geral para internet: integração futura com API externa exige redesenho.

Se a política da organização proibir allUsers (restrição de domínio), o apply de IAM pode falhar. Peça ao administrador uma solução autorizada ou implemente autenticação por ID token e invocadores específicos; não contorne a política. O fluxo público atual também depende dessa concessão.

## TRUST_PROXY_HOPS

Esperado no Cloud Run: cliente → front end Google → nginx web → front end Google → gateway, três proxies. O padrão local direto do gateway é 0; a configuração de deploy usa 3. A contagem real **precisa ser conferida**, inclusive se adicionar domínio, load balancer ou outro proxy.

Abra web_url e teste sessão, mensagens, SSE/reconexão e cookies em HTTPS. Compare o caminho real com a cadeia X-Forwarded-For no request do gateway por inspeção temporária controlada, sem registrar IPs ou cookies em logs permanentes. Não deduza saltos apenas da origem da conexão; nginx acrescenta o seu salto. Confira rate limit por IP e rejeição de Origin diferente. Se a cadeia diferir, ajuste a chave em infra/.env e use infra plan/apply; remova a instrumentação. Não aumente hops para mascarar erro: isso pode confiar em cabeçalho fornecido pelo cliente.

## Custos

Seis serviços, escala mínima zero; web máximo 2 e estado em memória máximo 1 nos demais. Cold start e conexões SSE ativas podem manter instâncias em execução. Há cobrança potencial por CPU/memória/requisições, rede/egress, imagens armazenadas, Secret Manager, logs e bucket versionado. Direct VPC egress evita um conector dedicado, mas não torna toda a stack gratuita. Consulte [preços do Cloud Run](https://cloud.google.com/run/pricing) e calcule conforme uso; não há estimativa validada desta implantação.

Orçamento opcional alerta em 50%, 90%, 100% e previsão de 100%; **não bloqueia gastos**. A conta deve usar BRL e o operador precisa dos papéis da tabela. Verifique recebimento real dos alertas. Após testes, destrua recursos; APIs e bucket permanecem.

## Segurança e rotação do segredo

SESSION_SECRET é gerado pelo Terraform e guardado no Secret Manager; somente a identidade do gateway recebe acesso ao secret. O estado GCS e plano salvo também contêm o valor. Restrinja acesso ao bucket privado/versionado e às cópias antigas; nunca imprima segredo, dump de estado ou conteúdo integral do plano.

Rotação mantém o fluxo de plano salvo e confirmação do script:

```bash
TF_CLI_ARGS_plan='-replace=random_password.session_secret' bash infra/deploy.sh infra apply
bash infra/deploy.sh smoke
```

`TF_CLI_ARGS_plan` é uma variável da CLI Terraform que acrescenta argumento somente a plan; não é chave do arquivo de configuração nem flag nova do deploy. Veja [referência de ambiente](https://developer.hashicorp.com/terraform/cli/config/environment-variables#tf_cli_args-and-tf_cli_args_name) e [replace no plan](https://developer.hashicorp.com/terraform/cli/commands/plan#replace-address). O plano deve substituir a senha, criar versão do secret e atualizar a referência versionada do gateway; confira antes de digitar sim. Testado estruturalmente/offline; rotação real ainda pendente. Invalida cookies/sessões existentes e cria revisão do gateway; não recupera estado em memória nem remove automaticamente todas as cópias antigas do segredo no histórico de estado.

## Limites conhecidos

Estado, buffers, diálogo e idempotência vivem em memória; deploy, rollback, rotação, encerramento ou escala para zero podem perder sessões/turnos. Afinidade de sessão não resolve isso e MAX=1 não impede reinício. O navegador pode precisar criar sessão nova; sessão antiga não recupera conversa do servidor. Não trate a POC como persistência de produção.

Probes do Cloud Run são TCP no startup, porque a imagem placeholder não tem /health. Health checks HTTP da aplicação foram comprovados no compose; probes HTTP de liveness na nuvem permanecem pendentes. O fake atende contratos de testes, sem regras reais de negócio. Cookies/Origin, rede e URLs da nuvem só serão confirmados no primeiro deploy. Não há domínio próprio, Cloud Armor ou monitoramento de uptime provisionados.

## Destruição

Confira o projeto no arquivo e leia o alvo exibido. O operador substitui o id abaixo pelo seu id real:

```bash
bash infra/deploy.sh destroy --confirm-project SEU_PROJECT_ID
```

Exige a flag igual ao PROJECT_ID **e** id digitado; `--yes` nunca elimina essa confirmação. Remove a stack Terraform (serviços, rede, registry/imagens, contas, secret e orçamento opcional); APIs não são desabilitadas. Bucket de estado criado pelo bootstrap fica, com versões que contêm segredo. Só depois de confirmar destruição e necessidade de retenção, o operador pode remover separadamente o bucket pelo console. Agentes nunca executam destroy: o operador roda o comando e digita o id no próprio terminal; autorização explícita do pedido atual é necessária para flags de confirmação.

**Não verificado:** com Direct VPC egress, depois que os serviços do Cloud Run são apagados o GCP pode manter por um tempo os IPs serverless reservados na sub-rede; nesse caso o `destroy` falha ao apagar a sub-rede (ou a rede). Nada foi perdido: espere um pouco (pode levar horas) e simplesmente rode o mesmo comando de novo, que remove o que restou.

## Pendências

- Primeiro deploy real: permissões/políticas, cold start, URLs, Origin/cookies, TRUST_PROXY_HOPS, ingresso interno + Direct VPC egress e plan sem diferença após atualização de imagem.
- Autenticação por ID token entre serviços e invocadores por identidade, substituindo allUsers nos internos.
- Serviços svc-cotacao, svc-apolice e svc-sinistro reais pela frente responsável, com convenção Dockerfile/contexto/8080/health acima.
- Probes HTTP /health de liveness, aplicadas após imagens reais.
- Domínio próprio, Cloud Armor, uptime checks, política de logs/estado e persistência de sessões.
- Gateway /v1/media; próxima tela decidida pelo servidor depois de data_exchange; validação dos Flows no Playground da Meta.
- Fixar versões/digests das imagens base e das ferramentas em contêiner.
- Deploy por CI como opção futura; hoje o CI continua apenas com verificação e build sem push.

Skills: [deploy-service](../.agents/skills/deploy-service/SKILL.md) e [monorepo-services](../.agents/skills/monorepo-services/SKILL.md). Detalhes de recursos/outputs: [infra Terraform](../infra/terraform/README.md).
