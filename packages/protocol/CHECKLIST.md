# Checklist: protocol

Última atualização: 2026-10-10

## Estrutura
- [x] Pacote com exports e tsconfig
- [x] Limites e códigos de erro em limits.ts
- [x] Result type

## Funcionalidades
- [x] Schema servidor→cliente: message.text
- [x] Schema servidor→cliente: message.voice
- [x] Schema servidor→cliente: message.code
- [x] Schema servidor→cliente: message.location
- [x] Schema servidor→cliente: message.template
- [x] Schema servidor→cliente: message.carousel
- [x] Schema servidor→cliente: message.quick_replies
- [x] Schema servidor→cliente: message.flow
- [x] Schema servidor→cliente: status.typing
- [x] Schema servidor→cliente: status.delivered
- [x] Schema servidor→cliente: status.read
- [x] Schema servidor→cliente: error
- [x] Schema cliente→servidor: user.text
- [x] Schema cliente→servidor: user.voice
- [x] Schema cliente→servidor: user.quick_reply
- [x] Schema cliente→servidor: user.flow_submit
- [x] Schema cliente→servidor: user.flow_data_exchange
- [x] Schema cliente→servidor: user.typing
- [x] Schema cliente→servidor: user.ack
- [x] parseServerEvent e parseClientEvent
- [x] ChatbotRequest e eventos do chatbot sem seq (parseChatbotLine, serializeChatbotLine)
- [ ] Campo flowJson refinado pelo schema de Flow JSON (Plano 5)

## Qualidade
- [x] Testes unitários
- [x] Lint, formatação e tsconfig estrito sem erros

## Pendências e decisões
- flowJson é um registro genérico até o Plano 5.
- mediaUrl/url restritos a http(s); ErrorPayload ganhou messageId e retryAfterMs; LIMITS.maxEventBytes
