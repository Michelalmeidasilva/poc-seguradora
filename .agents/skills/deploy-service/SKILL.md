---
name: deploy-service
description: Use quando o usuário pedir deploy local, build, rollback, smoke ou operação da infraestrutura GCP por serviço neste monorepo.
---

# Deploy por serviço

Use a CLI local para implantar um serviço ou a pilha inteira. Leia o contexto e as pré-condições em `docs/deploy.md`; execute a partir da raiz do repositório.

## Primeiro passo obrigatório

Execute `bash infra/deploy.sh check`. Ele valida ferramentas, login pessoal do gcloud, ADC e configuração; não altera recursos. Se falhar, pare, informe o problema e seu código antes de continuar.

A configuração fica em `infra/.env` (ignorado pelo git), criada pelo operador a partir de `infra/.env.example`. O script lê o arquivo sem executá-lo. Não peça o arquivo ou segredos ao usuário; confira os nomes e defaults no exemplo e em `infra/terraform/variables.tf`.

## Pedido → comando

| Pedido | Comando na raiz |
| --- | --- |
| Conferir ferramentas e configuração | `bash infra/deploy.sh check` |
| Ver a interface completa | `bash infra/deploy.sh help` |
| Preparar projeto e bucket uma vez | `bash infra/deploy.sh bootstrap` |
| Ver mudanças da infraestrutura | `bash infra/deploy.sh infra plan` |
| Aplicar infraestrutura com plano salvo | `bash infra/deploy.sh infra apply` |
| Construir e publicar imagens sem implantar | `bash infra/deploy.sh build all` |
| Implantar frontend | `bash infra/deploy.sh deploy web` |
| Implantar API de sessão e SSE | `bash infra/deploy.sh deploy gateway` |
| Implantar motor de conversa | `bash infra/deploy.sh deploy chatbot` |
| Implantar cotação | `bash infra/deploy.sh deploy svc-cotacao` |
| Implantar apólice | `bash infra/deploy.sh deploy svc-apolice` |
| Implantar sinistro | `bash infra/deploy.sh deploy svc-sinistro` |
| Implantar tudo em ordem de dependências | `bash infra/deploy.sh deploy all` |
| Voltar um serviço para imagem já publicada | `bash infra/deploy.sh rollback <serviço> --tag <tag-publicada>` |
| Ver imagem, URL e revisão | `bash infra/deploy.sh status` |
| Testar a URL pública | `bash infra/deploy.sh smoke` |
| Destruir infraestrutura: o usuário executa no próprio terminal | `bash infra/deploy.sh destroy --confirm-project <id>` |

`pnpm run infra:deploy <comando>` é o atalho para a mesma CLI. O `deploy` atualiza somente a imagem dos serviços pedidos, sem Terraform; `all` segue cotação → apólice → sinistro → chatbot → gateway → web e executa smoke uma vez no fim. `infra apply` mostra um novo plano, pede confirmação e aplica exatamente esse plano salvo em diretório temporário privado, fora do repositório, removido também em falhas e Ctrl-C.

## Flags

| Flag | Efeito e limite |
| --- | --- |
| `--yes` | Dispensa o texto `sim` nos comandos mutáveis; nunca dispensa o id digitado no destroy. |
| `--tag <tag>` | Tag no build/deploy; no rollback, tag publicada obrigatória. Default: SHA curto do commit. |
| `--existing-tag <tag>` | Deploy de imagem já publicada, verificada antes, sem build; incompatível com `--tag`. |
| `--allow-dirty` | Autoriza build/deploy com árvore suja; sem tag explícita usa sufixo dirty e data/hora. |
| `--no-smoke` | Omite smoke final de deploy/rollback. |
| `--url <url>` | URL pública para smoke ou smoke de deploy/rollback. |
| `--confirm-project <id>` | Obrigatória no destroy; deve coincidir com o projeto configurado, que também é digitado. |
| `--env-file <arquivo>` | Troca o arquivo de configuração; aplicável aos comandos que o leem. |
| `--help` | Mostra ajuda sem configuração ou ferramentas. |

Build/deploy recusam árvore suja sem a flag correspondente. Build recusa sobrescrever tag existente; deploy com imagem existente e rollback verificam a tag no registro. Confirme flags compatíveis pelo `help` antes de usar uma combinação nova.

## Regras obrigatórias do agente

- Nunca passe `--yes` ou `--confirm-project` sem autorização explícita do usuário no pedido atual. Um pedido genérico para fazer deploy não autoriza essas flags.
- Nunca execute `destroy` por iniciativa própria. A confirmação digitada do projeto continua obrigatória.
- O agente nunca executa `destroy`, nem a pedido: o usuário roda o comando e digita o id do projeto no próprio terminal. Mostre a ele o comando exato e o que será destruído.
- Nunca forneça `sim` nem o id do projeto pela entrada padrão, de nenhuma forma: pipe, `yes`, heredoc, here-string, `expect` ou equivalente. As confirmações existem para o usuário digitar; o terminal do agente não é o dele.
- Sem `--yes` autorizado explicitamente, mostre ao usuário o resumo e peça que ele execute o comando no próprio terminal (sem um terminal interativo a confirmação lê fim de entrada e o comando aborta com código 4).
- Com `--yes` autorizado em `infra apply`, o comando gera um plano novo e o aplica sem pausa: compare a linha `Resumo:` com a do plano mostrado antes e pare se for diferente, reportando ao usuário que o aplicado diferiu do mostrado; não rode mais nenhum comando mutável.
- Sempre mostre a saída do plano ao usuário antes de pedir confirmação. O plano contém material sensível: apresente as mudanças com os valores sensíveis ocultos pelo Terraform; não copie o arquivo de plano. Operações sem Terraform mostram seu resumo de ação antes da confirmação.
- Nunca imprima nem armazene segredos ou o conteúdo de `infra/.env`. Não registre o plano salvo nem capture variáveis de ambiente em logs.
- Pare e reporte qualquer saída diferente de zero, com o significado do código de saída. Não repita operações mutáveis automaticamente; informe quais serviços foram atualizados, os não tentados e eventual opção de rollback.
- Se faltar Dockerfile de um svc-*, diga ao usuário que será usada a imagem FAKE. A CLI usa `infra/fake-services/Dockerfile`, mantém a tag do serviço e imprime `AVISO: imagem FAKE`; não descreva isso como serviço real implementado.
- Não edite `apps/svc-*`. Consulte o dono no `WORKBOARD.md`; os serviços reais pertencem a outra frente.

| Código | Significado |
| --- | --- |
| 0 | Sucesso |
| 1 | Outro erro, inclusive falha de comando externo |
| 2 | Uso ou configuração inválidos |
| 3 | Pré-condição falhou: ferramenta, árvore suja, tag existente ou imagem ausente |
| 4 | Operador abortou ou confirmação não confere |
| 5 | Smoke falhou; a imagem pode já ter sido atualizada |

A identidade é a do operador, com login gcloud e ADC descritos no runbook. O pedido de deploy não autoriza criar chaves de service account, WIF, workflows ou modificar os serviços internos.
