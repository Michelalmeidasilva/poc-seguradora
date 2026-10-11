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

resource "google_service_account" "fake_services" {
  project      = var.project_id
  account_id   = "seguradora-fake-services"
  display_name = "seguradora fake-services runtime"

  depends_on = [google_project_service.apis]
}

# Identity that runs Terraform and pushes images from GitHub Actions (through WIF, no keys).
resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "seguradora-deployer"
  display_name = "seguradora deployer (GitHub Actions)"

  depends_on = [google_project_service.apis]
}

locals {
  # Project roles the deployer needs to plan/apply THIS stack and nothing more:
  deployer_project_roles = toset(concat([
    "roles/run.admin",                       # Cloud Run services and their IAM (allUsers invoker)
    "roles/artifactregistry.admin",          # the repository (cleanup policies) and image push
    "roles/secretmanager.admin",             # the SESSION_SECRET secret, its versions and IAM
    "roles/compute.networkAdmin",            # VPC and subnet
    "roles/iam.serviceAccountAdmin",         # the five service accounts and their IAM
    "roles/iam.workloadIdentityPoolAdmin",   # GitHub WIF pool/provider
    "roles/resourcemanager.projectIamAdmin", # these project role bindings (also reads the project)
    "roles/serviceusage.serviceUsageAdmin",  # google_project_service and the budget quota project
    ], var.billing_account_id != "" && var.budget_alert_email != "" ? [
    "roles/monitoring.notificationChannelEditor", # budget e-mail channel
  ] : []))

  runtime_service_accounts = {
    web           = google_service_account.web.name
    gateway       = google_service_account.gateway.name
    chatbot       = google_service_account.chatbot.name
    fake_services = google_service_account.fake_services.name
  }
}

resource "google_project_iam_member" "deployer" {
  for_each = local.deployer_project_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# actAs only on the four runtime identities (not project-wide), required to deploy Cloud Run
# revisions that run as them.
resource "google_service_account_iam_member" "deployer_act_as" {
  for_each = local.runtime_service_accounts

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# Terraform state (the bucket itself is created by the bootstrap in the runbook, not here).
resource "google_storage_bucket_iam_member" "deployer_state" {
  count = var.tf_state_bucket == "" ? 0 : 1

  bucket = var.tf_state_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# Workload Identity Federation for GitHub Actions (only when github_repository is set).
resource "google_iam_workload_identity_pool" "github" {
  count = var.github_repository == "" ? 0 : 1

  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "OIDC tokens from GitHub Actions of ${var.github_repository}."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = var.github_repository == "" ? 0 : 1

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.ref"         = "assertion.ref"
    "attribute.environment" = "assertion.environment"
  }

  # Only this repository, and only from main, a v* tag or the protected `production`
  # environment (the deploy workflow's approval gate). Tokens from forks, other branches or
  # other repositories are rejected before any impersonation.
  attribute_condition = join(" && ", [
    "assertion.repository == \"${var.github_repository}\"",
    "(assertion.ref == \"refs/heads/main\" || assertion.ref.startsWith(\"refs/tags/v\") || assertion.environment == \"production\")",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deployer_wif" {
  count = var.github_repository == "" ? 0 : 1

  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repository}"
}
