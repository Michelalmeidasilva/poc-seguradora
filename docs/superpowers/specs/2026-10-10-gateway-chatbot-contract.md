# Contrato gateway ↔ chatbot

Documento autocontido para quem implementa o chatbot (Plano 3). Os schemas vivem em `@seguradora/protocol` (`ChatbotRequestSchema`, `UnsequencedServerEventSchema`); este texto descreve o comportamento esperado dos dois lados. Fonte da verdade do formato: o código do pacote; fonte do comportamento: o gateway (`apps/gateway`).

## 1. Requisição (gateway → chatbot)

`POST {CHATBOT_URL}/v1/chat/events`

| Cabeçalho | Valor |
| --- | --- |
| `content-type` | `application/json` |
| `accept` | `application/x-ndjson` |
| `x-correlation-id` | o `correlationId` do evento, **somente** se for seguro para cabeçalho (ver seção 8) |

Corpo (`ChatbotRequest`):

```json
{ "v": 1, "sessionId": "…", "correlationId": "…", "event": { "…": "ClientEvent" } }
```

`event` é um `ClientEvent` já validado pelo gateway (`user.text`, `user.voice`, `user.quick_reply`, `user.flow_submit`, `user.flow_data_exchange`). Eventos `user.typing` e `user.ack` **não** são repassados ao chatbot.

## 2. Resposta (chatbot → gateway)

- Status `200` e `content-type: application/x-ndjson`.
- O corpo tem **um evento por linha** (`UnsequencedServerEvent`: envelope `{ v: 1, id, sessionId, correlationId, ts, type, payload }` **sem `seq`**; o gateway atribui o `seq`). Toda linha termina em `\n`.
- Tamanho máximo de uma linha: 256 KB (`LIMITS.maxEventBytes * 4` = 262144 caracteres). Acima disso o gateway aborta o turno com `internal_error`.
- Linha inválida (JSON ruim ou fora do schema) aborta o turno com `internal_error`; o que já foi publicado permanece.
- Linhas cujo `sessionId` difere do da requisição são **descartadas** (e registradas em log), nunca entregues.
- Um corpo `200` vazio é um turno válido (por exemplo, um evento que não gera resposta).
- A conexão fecha ao fim do turno.

## 3. Cabeçalhos imediatos e `status.delivered`

- O chatbot **deve enviar os cabeçalhos da resposta imediatamente** (`res.writeHead(200, …)` e flush), **antes** de chamar qualquer serviço interno. O timeout de conexão do gateway (`CHATBOT_CONNECT_TIMEOUT_MS`, padrão 5 s) cobre apenas o tempo até os cabeçalhos e, ao estourar, **a chamada é repetida**. Um chatbot que só responde os cabeçalhos junto com o primeiro resultado do serviço interno será repetido sem necessidade.
- O chatbot **não deve emitir `status.delivered`**: o gateway o publica sozinho assim que recebe os cabeçalhos `2xx`.

## 4. Ordem e concorrência

O gateway executa **no máximo um turno em andamento por sessão**. Os demais eventos da mesma sessão esperam em fila FIFO (até `MAX_QUEUED_TURNS`, padrão 5, entre em execução e em espera; acima disso o gateway responde `429` ao cliente e não chama o chatbot). Portanto o chatbot pode contar com eventos de uma mesma sessão chegando em ordem, um turno por vez. Sessões diferentes executam em paralelo.

## 5. Idempotência e repetição

- O gateway pode repetir a mesma chamada (mesmo `event.id`) **somente quando nenhum cabeçalho de resposta foi recebido**: timeout de conexão, falha de rede antes dos cabeçalhos, ou status `502`/`503`/`504`. Há ainda uma repetição posterior possível quando o usuário reenvia a mensagem após o gateway ter respondido `upstream_unavailable` com `messageId` (falha antes da entrega).
- O chatbot **não deve executar o mesmo `event.id` duas vezes**. Uma chamada repetida deve devolver o **mesmo resultado** da primeira execução (reemitindo as mesmas linhas, com os mesmos `id` de evento) ou aguardar a execução em andamento e então devolver esse resultado.
- Depois que os cabeçalhos `2xx` chegam, o gateway **não repete** a chamada.

## 6. Códigos de status

| Status | Significado para o gateway |
| --- | --- |
| `2xx` | turno aceito; o corpo é lido como NDJSON |
| `502`, `503`, `504` | falha transitória; repetida com backoff (`CHATBOT_RETRIES`, padrão 2) e conta para o circuit breaker |
| demais `4xx`/`5xx` | terminal; o usuário recebe `error` `upstream_unavailable` com `messageId` (a mesma mensagem pode ser reenviada) |

Circuito aberto ou bulkhead cheio também resultam em `upstream_unavailable` sem chamar o chatbot.

## 7. Falha no meio do stream

Se a conexão cair, o corpo for inválido ou o turno estourar `CHATBOT_TURN_TIMEOUT_MS` **depois** dos cabeçalhos `2xx`:

- o gateway publica `error` (`upstream_unavailable` ou `internal_error`) **sem `messageId`**, com a mensagem «A resposta foi interrompida. Envie sua mensagem novamente como uma nova mensagem.»;
- o `id` do evento permanece registrado: um reenvio com o mesmo `id` recebe `200 duplicate`; o usuário precisa enviar **uma nova mensagem** (novo `id`);
- o chatbot não receberá nova chamada para esse `event.id`.

`CHATBOT_TURN_TIMEOUT_MS` (padrão 60 s) limita o turno inteiro, incluindo a leitura do stream.

## 8. `x-correlation-id`

- O `correlationId` do protocolo é restrito a `/^[\x21-\x7e]{1,128}$/` (ASCII imprimível sem espaços, 1 a 128 caracteres), portanto seguro como valor de cabeçalho. O gateway ainda omite o cabeçalho se o valor não satisfizer a regra (segunda barreira); o corpo sempre carrega o valor original.
- O chatbot deve usar o `correlationId` do corpo (não confiar só no cabeçalho), repetir o mesmo valor em todos os eventos que emite e **repassá-lo, como `x-correlation-id`, aos serviços internos**.
