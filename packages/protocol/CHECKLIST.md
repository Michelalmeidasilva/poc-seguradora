# Checklist: protocol

Última atualização: 2026-10-10

## Estrutura
- [x] Pacote com exports e tsconfig
- [x] Limites e códigos de erro em limits.ts
- [x] Result type

## Funcionalidades
- [x] Schemas das mensagens servidor→cliente (12 tipos)
- [x] Schemas dos eventos cliente→servidor (7 tipos)
- [x] parseServerEvent e parseClientEvent
- [ ] Campo flowJson refinado pelo schema de Flow JSON (Plano 5)

## Qualidade
- [x] Testes unitários
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- flowJson é um registro genérico até o Plano 5.
