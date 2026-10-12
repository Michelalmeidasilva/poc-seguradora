# Checklist: infra — Plano 8

Última atualização: 2026-10-11

## Implementação

- [x] CLI local por serviço, configuração validada e testes offline; revisão concluída em cda5c75
- [x] Terraform com seis serviços, imagens independentes e sem identidades de CI
- [x] Skills deploy-service e monorepo-services, links e verificadores (72 fixtures locais e verificadores reais passando)
- [x] Runbook local consistente (20 fixtures e checker real passando) e workflow de deploy removido (77fad33, CI genérico/actionlint passando)

## Qualidade

- [x] Verificação final de tipos, lint, formato, arquitetura, testes e build (suíte inteira sem mudar assertions; depcruise com Node suportado)
- [x] Terraform validado offline (fmt/init sem backend/validate + estrutura) e workflow de CI validado com self-tests/actionlint
- [x] Compose com smoke e testes do nginx (evidência do controlador: infra/test-nginx.sh exit 0, /private/tmp/plan8-nginx.log; nenhuma mudança em app/compose/nginx depois)
- [x] Revisão final e atualização do workboard (revisão final do controlador em 2026-10-12; correções aplicadas e verificadas; linha deploy = done)

## Pendências e decisões

- Aplicação real no GCP e validação de ingresso interno, egress VPC, URLs e TRUST_PROXY_HOPS ficam fora do Plano 8.
- Autenticação por ID token, probes HTTP e serviços internos reais permanecem pendentes, conforme o plano.
- Sem chamadas reais ao GCP durante o desenvolvimento; testes do deploy usam ferramentas falsas.
