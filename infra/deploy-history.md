# Histórico de build e deploy

Uma linha por serviço a cada `build`/`deploy`/`rollback` de `bash infra/deploy.sh` (somente acrescenta;
o script não faz commit: versione o arquivo depois de um deploy). Tempos em segundos inteiros.
`Build` = build + push da imagem (`-` quando não houve build); `Deploy` = `gcloud run services update` + leitura da revisão.
`Versão` é a tag da imagem (SHA curto do commit; `-dirty-` = árvore suja; `existing-tag` cobre rollback).

| Data (UTC) | Serviço | Ação | Versão (tag) | Commit | Branch | Versão do app | Imagem | Build (s) | Deploy (s) | Revisão Cloud Run | Resultado | Projeto | Região | Operador |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12T23:16:00Z | svc-cotacao | deploy | 8575712 | 8575712 | master | - | FAKE | - | - | svc-cotacao-00002-w28 | ok (primeiro deploy, anterior ao histórico; tempos não medidos) | seguradora-poc-846744 | southamerica-east1 | user |
| 2026-10-12T23:16:00Z | svc-apolice | deploy | 8575712 | 8575712 | master | - | FAKE | - | - | svc-apolice-00002-8dr | ok (primeiro deploy, anterior ao histórico; tempos não medidos) | seguradora-poc-846744 | southamerica-east1 | user |
| 2026-10-12T23:16:00Z | svc-sinistro | deploy | 8575712 | 8575712 | master | - | FAKE | - | - | svc-sinistro-00002-km5 | ok (primeiro deploy, anterior ao histórico; tempos não medidos) | seguradora-poc-846744 | southamerica-east1 | user |
| 2026-10-12T23:16:00Z | chatbot | deploy | 8575712 | 8575712 | master | - | própria | - | - | chatbot-00002-vvg | ok (primeiro deploy, anterior ao histórico; tempos não medidos) | seguradora-poc-846744 | southamerica-east1 | user |
| 2026-10-12T23:16:00Z | gateway | deploy | 8575712 | 8575712 | master | - | própria | - | - | gateway-00002-lxx | ok (primeiro deploy, anterior ao histórico; tempos não medidos) | seguradora-poc-846744 | southamerica-east1 | user |
| 2026-10-12T23:16:00Z | web | deploy | 8575712 | 8575712 | master | - | própria | - | - | web-00002-knv | ok (primeiro deploy, anterior ao histórico; tempos não medidos) | seguradora-poc-846744 | southamerica-east1 | user |
