# Contratos dos serviços internos (cotação, apólice, sinistro)

Data: 2026-10-10 · Parte do spec `2026-10-10-whatsapp-chatbot-poc-design.md` (seção 8)

Este documento é autossuficiente para quem vai implementar os três serviços. O contexto geral (gateway, chatbot, web) está no spec principal, mas não é necessário para esta tarefa. A estrutura hexagonal citada na seção 1 está descrita na seção 14 do spec principal e resumida abaixo.

**Estrutura hexagonal (resumo):** cada serviço tem `src/domain` (regras puras, sem I/O), `src/application` (casos de uso e ports/interfaces), `src/infra` (adapters: HTTP com Fastify, leitura dos JSON) e `src/main.ts` (composition root com injeção manual). Dependência só no sentido `infra → application → domain`. Stack: Node + TypeScript estrito + Fastify + Zod; monorepo pnpm em `apps/svc-cotacao`, `apps/svc-apolice` e `apps/svc-sinistro`.

## 1. Instrução de desenvolvimento (handoff)

Os três serviços deste documento serão desenvolvidos **por outro agente, em paralelo** ao restante do sistema. Este documento descreve **somente os contratos**. A implementação interna é livre, desde que:
- siga a estrutura hexagonal da seção 14 do spec principal (`domain` / `application` / `infra` / `main.ts`);
- cumpra exatamente os contratos abaixo (rotas, campos, nomes, tipos, códigos de status e erros);
- não altere um contrato sem acordo prévio, porque o chatbot gera seus clientes a partir dele;
- entregue em cada serviço um `openapi.yaml` fiel a este contrato, os fixtures de `data/*.json` da seção 6 e testes de contrato;
- trabalhe dentro do **monorepo único** `seguradora-services` (um só `git init`, na raiz; não crie repositório dentro de `apps/svc-*`). Antes de implementar, a estrutura do monorepo e o `package.json` do seu serviço devem existir e estar commitados;
- antes de escrever código, reivindique sua frente no `WORKBOARD.md` da raiz (linhas `svc-cotacao`, `svc-apolice`, `svc-sinistro`), seguindo o protocolo da seção 15.3 do spec principal: `Status` `in_progress`, seu `Dono`, `Branch` e datas, em commit próprio, e só altere os arquivos do seu caminho. Ao terminar, marque `done`;
- mantenha na raiz de cada serviço (`apps/svc-cotacao`, `apps/svc-apolice`, `apps/svc-sinistro`) um `CHECKLIST.md` com o que já foi feito e o que falta (uma linha por rota do contrato, `openapi.yaml`, fixtures, injeção de falha, `/health` + `/ready`, testes). Crie-o com todos os itens em aberto antes de começar e atualize-o no mesmo commit que conclui cada item. Formato na seção 15.2 do spec principal, resumido aqui:
  - seções `Estrutura`, `Funcionalidades`, `Qualidade` e `Pendências e decisões`;
  - itens como `- [ ]` (aberto) ou `- [x]` (concluído, com código, testes passando e commit feito);
  - data de última atualização no topo.

## 2. Convenções comuns aos três serviços

- **Formato:** JSON, UTF-8, prefixo `/v1`. Datas em ISO 8601 (`2026-10-10T12:00:00Z`, ou `YYYY-MM-DD` quando for só data). Valores monetários como inteiro em centavos (`valorCentavos`) e `moeda: "BRL"`.
- **Cabeçalhos de requisição:** `X-Correlation-Id` (obrigatório, devolvido na resposta e presente em todo log) e `Authorization: Bearer <id-token>` (token de service account do Cloud Run; validação desligada em desenvolvimento local por variável de ambiente).
- **Saúde:** `GET /health` (processo vivo) e `GET /ready` (dados carregados) respondem 200 sem autenticação.
- **Portas locais:** cotação 3101, apólice 3102, sinistro 3103. No Cloud Run, a porta vem de `PORT`.
- **Modelo de erro** (qualquer status ≥ 400):
```json
{ "error": { "code": "not_found", "message": "texto legível", "correlationId": "..." } }
```
| Status | `code` | Quando |
|---|---|---|
| 400 | `validation_error` | corpo ou parâmetro inválido (`message` indica o campo) |
| 404 | `not_found` | recurso inexistente |
| 409 | `conflict` | operação incompatível com o estado do recurso |
| 429 | `rate_limited` | uso excessivo |
| 500 | `internal_error` | falha inesperada |
| 503 | `unavailable` | indisponibilidade (também usada pela injeção de falha) |
- **Injeção de falha** (só com `MOCK_FAULTS=true`, ignorada caso contrário): `X-Mock-Latency-Ms: <inteiro>` atrasa a resposta; `X-Mock-Error: <status>` devolve esse status com o modelo de erro acima, sem executar a operação.
- **Idempotência em `POST`:** o cabeçalho opcional `Idempotency-Key` repetido devolve a mesma resposta, sem criar outro recurso.
- **Dados:** somente leitura a partir de `data/*.json`. Os `POST` devolvem identificadores gerados e, para a resposta ao próprio `Idempotency-Key`, podem guardar em memória. Nada é gravado em disco.
- **Dados fictícios:** CPFs e nomes são sempre fictícios. CPFs na resposta saem mascarados (`***.456.789-**`).

## 3. Contrato: `svc-cotacao`

| Método e rota | Descrição |
|---|---|
| `GET /v1/produtos` | Lista os produtos cotáveis |
| `POST /v1/cotacoes` | Calcula uma cotação |
| `GET /v1/cotacoes/{cotacaoId}` | Consulta uma cotação |

`GET /v1/produtos` → 200
```json
{ "produtos": [ { "codigo": "AUTO", "nome": "Seguro Auto",
  "coberturasOpcionais": [ { "codigo": "VIDROS", "nome": "Vidros" } ] } ] }
```
Códigos de produto: `AUTO`, `RESIDENCIAL`, `VIDA`.

`POST /v1/cotacoes` → 201 (400 se inválido)
```json
// corpo
{ "produto": "AUTO",
  "cliente": { "nome": "string", "cpf": "string(11 dígitos)", "dataNascimento": "YYYY-MM-DD" },
  "dados": { },
  "coberturas": ["VIDROS"] }
```
`dados` depende do produto:
- `AUTO`: `{ "veiculo": { "marca": "string", "modelo": "string", "ano": 2020 }, "cep": "string(8 dígitos)" }`
- `RESIDENCIAL`: `{ "cep": "string(8 dígitos)", "tipoImovel": "CASA" | "APARTAMENTO", "valorImovelCentavos": 0 }`
- `VIDA`: `{ "capitalSeguradoCentavos": 0 }`

Resposta:
```json
{ "cotacaoId": "CT-3001", "produto": "AUTO", "status": "CALCULADA",
  "premioMensal": { "valorCentavos": 18990, "moeda": "BRL" },
  "coberturas": [ { "codigo": "COLISAO", "nome": "Colisão", "limiteCentavos": 5000000 } ],
  "criadaEm": "2026-10-10T12:00:00Z", "validaAte": "2026-10-17" }
```
`GET /v1/cotacoes/{cotacaoId}` → 200 com o mesmo corpo acima, ou 404.

## 4. Contrato: `svc-apolice`

| Método e rota | Descrição |
|---|---|
| `GET /v1/apolices?cpf={cpf}` | Lista as apólices do cliente (resumo) |
| `GET /v1/apolices/{numero}` | Detalhe de uma apólice |
| `GET /v1/apolices/{numero}/segunda-via` | Gera a segunda via |

`GET /v1/apolices?cpf=` → 200 (400 se `cpf` ausente ou inválido; lista vazia se não houver)
```json
{ "apolices": [ { "numero": "AP-1001", "produto": "AUTO", "status": "ATIVA",
  "vigencia": { "inicio": "2026-01-01", "fim": "2026-12-31" } } ] }
```
`GET /v1/apolices/{numero}` → 200 (404 se não existir)
```json
{ "numero": "AP-1001", "produto": "AUTO",
  "status": "ATIVA",
  "vigencia": { "inicio": "2026-01-01", "fim": "2026-12-31" },
  "segurado": { "nome": "Maria Souza", "cpfMascarado": "***.456.789-**" },
  "coberturas": [ { "codigo": "COLISAO", "nome": "Colisão", "limiteCentavos": 5000000 } ],
  "premio": { "valorCentavos": 18990, "moeda": "BRL", "periodicidade": "MENSAL" },
  "proximoVencimento": "2026-11-10" }
```
`status`: `ATIVA` | `VENCIDA` | `CANCELADA`. `proximoVencimento` é `null` para `VENCIDA` e `CANCELADA`.

`GET /v1/apolices/{numero}/segunda-via` → 200 (404 se não existir; 409 se `CANCELADA`)
```json
{ "numero": "AP-1001", "documentoUrl": "https://exemplo.invalid/docs/AP-1001.pdf",
  "geradoEm": "2026-10-10T12:00:00Z", "expiraEm": "2026-10-10T13:00:00Z" }
```
`documentoUrl` é fictícia (domínio `.invalid`). O serviço não gera PDF.

## 5. Contrato: `svc-sinistro`

| Método e rota | Descrição |
|---|---|
| `POST /v1/sinistros` | Abre um sinistro |
| `GET /v1/sinistros/{protocolo}` | Consulta um sinistro e seu histórico |
| `GET /v1/sinistros?apolice={numero}` | Lista os sinistros de uma apólice |

`POST /v1/sinistros` → 201 (400 se inválido; 404 se a apólice não existir; 409 se a apólice não estiver `ATIVA`)
```json
// corpo
{ "apoliceNumero": "AP-1001",
  "tipo": "COLISAO" | "ROUBO" | "FURTO" | "INCENDIO" | "DANOS_ELETRICOS" | "OUTROS",
  "dataOcorrencia": "YYYY-MM-DD",
  "descricao": "string(1..1000)",
  "local": { "latitude": -23.55, "longitude": -46.63, "endereco": "string" },
  "anexos": [ { "mediaId": "string", "fileName": "string" } ] }
```
`local` e `anexos` são opcionais (`anexos` com até 10 itens). `dataOcorrencia` não pode ser futura. Resposta:
```json
{ "protocolo": "SN-2002", "status": "ABERTO",
  "criadoEm": "2026-10-10T12:00:00Z", "previsaoRetorno": "2026-10-15" }
```
`GET /v1/sinistros/{protocolo}` → 200 (404 se não existir)
```json
{ "protocolo": "SN-2001", "apoliceNumero": "AP-1001", "tipo": "COLISAO",
  "status": "EM_ANALISE", "dataOcorrencia": "2026-09-30",
  "descricao": "string",
  "timeline": [ { "ts": "2026-10-01T09:00:00Z", "status": "ABERTO", "descricao": "Sinistro registrado" },
                { "ts": "2026-10-02T14:00:00Z", "status": "EM_ANALISE", "descricao": "Em análise pela equipe" } ] }
```
`status`: `ABERTO` | `EM_ANALISE` | `APROVADO` | `NEGADO` | `ENCERRADO`.

`GET /v1/sinistros?apolice=` → 200 (400 se `apolice` ausente)
```json
{ "sinistros": [ { "protocolo": "SN-2001", "tipo": "COLISAO", "status": "EM_ANALISE",
  "dataOcorrencia": "2026-09-30" } ] }
```

## 6. Fixtures obrigatórios (`data/*.json`)

Para que a demo seja determinística, cada serviço entrega, no mínimo:

| Serviço | Fixtures |
|---|---|
| `svc-apolice` | CPF `12345678901` com `AP-1001` (AUTO, `ATIVA`), `AP-1002` (RESIDENCIAL, `VENCIDA`) e `AP-1003` (VIDA, `CANCELADA`). Um CPF sem apólices (`00000000000`) |
| `svc-sinistro` | `SN-2001` (de `AP-1001`, `EM_ANALISE`, com `timeline` de 2 eventos) e `SN-2003` (de `AP-1001`, `ENCERRADO`). Numeração dos novos protocolos a partir de `SN-2002` |
| `svc-cotacao` | `CT-3001` (AUTO, `CALCULADA`) e os três produtos de `GET /v1/produtos`. Prêmios calculados por regra simples e determinística a partir dos dados de entrada |

O chatbot e os testes E2E dependem desses identificadores.

