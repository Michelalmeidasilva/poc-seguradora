# Checklist: protocol

Última atualização: 2026-10-10

## Estrutura
- [ ] Pacote com exports e tsconfig
- [ ] Limites e códigos de erro em limits.ts
- [ ] Result type

## Funcionalidades
- [ ] Schemas das mensagens servidor→cliente (12 tipos)
- [ ] Schemas dos eventos cliente→servidor (7 tipos)
- [ ] parseServerEvent e parseClientEvent
- [ ] Campo flowJson refinado pelo schema de Flow JSON (Plano 5)

## Qualidade
- [ ] Testes unitários
- [ ] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- flowJson é um registro genérico até o Plano 5.
