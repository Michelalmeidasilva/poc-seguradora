# SESSION_SECRET of the gateway (cookie signing). Generated here, never typed by a person and
# never in the repo. The value lives in Secret Manager and in the Terraform state, so the
# state bucket must be private (runbook). Rotation: terraform apply -replace=random_password.session_secret
# (every active session is lost).
resource "random_password" "session_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "session_secret" {
  project   = var.project_id
  secret_id = "seguradora-session-secret"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "session_secret" {
  secret      = google_secret_manager_secret.session_secret.id
  secret_data = random_password.session_secret.result
}

# Only the gateway can read it.
resource "google_secret_manager_secret_iam_member" "gateway_session_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.session_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gateway.email}"
}
