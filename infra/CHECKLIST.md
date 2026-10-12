# Checklist: infra — Plano 8

Última atualização: 2026-10-11

## Implementação

- [x] CLI local por serviço, configuração validada e testes offline; revisão concluída em cda5c75
- [ ] Terraform com seis serviços, imagens independentes e sem identidades de CI
- [ ] Skills deploy-service e monorepo-services, links e verificadores
- [ ] Runbook local consistente e workflow de deploy removido

## Qualidade

- [ ] Verificação final de tipos, lint, formato, arquitetura, testes e build
- [ ] Terraform validado offline e workflow de CI validado
- [ ] Compose com smoke e testes do nginx
- [ ] Revisão final e atualização do workboard

## Pendências e decisões

- Aplicação real no GCP e validação de ingresso interno, egress VPC, URLs e TRUST_PROXY_HOPS ficam fora do Plano 8.
- Autenticação por ID token, probes HTTP e serviços internos reais permanecem pendentes, conforme o plano.
- Sem chamadas reais ao GCP durante o desenvolvimento; testes do deploy usam ferramentas falsas.
