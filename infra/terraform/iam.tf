# Runtime service accounts: one per Cloud Run service, with no project-level role. Cloud Run
# writes stdout logs and pulls same-project images with its own service agent, so the runtime
# identities need nothing else; the only grant is the gateway's access to SESSION_SECRET
# (secrets.tf).
resource "google_service_account" "web" {
  project      = var.project_id
  account_id   = "seguradora-web"
  display_name = "seguradora web (nginx) runtime"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "gateway" {
  project      = var.project_id
  account_id   = "seguradora-gateway"
  display_name = "seguradora gateway runtime"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "chatbot" {
  project      = var.project_id
  account_id   = "seguradora-chatbot"
  display_name = "seguradora chatbot runtime"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "svc_cotacao" {
  project      = var.project_id
  account_id   = "seguradora-svc-cotacao"
  display_name = "seguradora svc-cotacao runtime"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "svc_apolice" {
  project      = var.project_id
  account_id   = "seguradora-svc-apolice"
  display_name = "seguradora svc-apolice runtime"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "svc_sinistro" {
  project      = var.project_id
  account_id   = "seguradora-svc-sinistro"
  display_name = "seguradora svc-sinistro runtime"
  depends_on   = [google_project_service.apis]
}
