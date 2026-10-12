# No output carries a credential or the session key; only URLs and resource names.

output "web_url" {
  description = "Public URL of the product (the smoke test target). Custom domain when set, else the Cloud Run URL."
  value       = local.web_public_url
}

output "gateway_url" {
  description = "Public gateway URL (computed, deterministic Cloud Run format); the web proxies /v1 to it."
  value       = local.run_url.gateway
}

output "service_uris" {
  description = "Real `uri` reported by Cloud Run for each service, to compare with the computed URLs."
  value = {
    web          = google_cloud_run_v2_service.web.uri
    gateway      = google_cloud_run_v2_service.gateway.uri
    chatbot      = google_cloud_run_v2_service.chatbot.uri
    svc_cotacao  = google_cloud_run_v2_service.svc_cotacao.uri
    svc_apolice  = google_cloud_run_v2_service.svc_apolice.uri
    svc_sinistro = google_cloud_run_v2_service.svc_sinistro.uri
  }
}

output "computed_urls" {
  description = "URLs computed as https://<service>-<project_number>.<region>.run.app and wired into the env of the services."
  value       = local.run_url
}

output "url_consistency_note" {
  description = "How to check that the computed URLs (used in env vars) match what Cloud Run serves."
  value       = "The env vars use the deterministic Cloud Run v2 URL https://<service>-<project_number>.<region>.run.app (computed_urls) to avoid a Terraform cycle. Cloud Run also serves it; service_uris may show the other (hash) format. Check after apply: curl -s <computed_urls.web>/health must return ok and the smoke test must pass against web_url. If a computed URL does not answer, the env wiring (GATEWAY_URL, ALLOWED_ORIGIN, CHATBOT_URL, *_URL) points at a wrong host: compare with service_uris."
}

output "artifact_registry" {
  description = "Docker registry prefix: push <artifact_registry>/<service>:<tag>."
  value       = local.registry
}
