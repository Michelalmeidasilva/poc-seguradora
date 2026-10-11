data "google_project" "project" {
  project_id = var.project_id
}

locals {
  base_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
  budget_apis = var.billing_account_id == "" ? [] : concat(
    ["billingbudgets.googleapis.com"],
    var.budget_alert_email == "" ? [] : ["monitoring.googleapis.com"],
  )
  apis = toset(concat(local.base_apis, local.budget_apis))

  registry = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}"
  images = {
    web           = "${local.registry}/web:${var.image_tag}"
    gateway       = "${local.registry}/gateway:${var.image_tag}"
    chatbot       = "${local.registry}/chatbot:${var.image_tag}"
    fake_services = "${local.registry}/fake-services:${var.image_tag}"
  }

  service_names = {
    web           = "web"
    gateway       = "gateway"
    chatbot       = "chatbot"
    fake_services = "fake-services"
  }

  # Deterministic Cloud Run v2 URL: https://<service>-<project_number>.<region>.run.app.
  # Computing it from the project number (instead of reading `uri`) lets services reference
  # each other without a dependency cycle (web -> gateway URL, gateway -> web URL as origin).
  # outputs.tf prints the real `uri` too, so the operator can compare after the first apply.
  run_url = {
    for k, name in local.service_names :
    k => "https://${name}-${data.google_project.project.number}.${var.region}.run.app"
  }

  web_public_url = var.web_custom_domain_url != "" ? var.web_custom_domain_url : local.run_url.web

  internal_service_urls = var.deploy_fake_services ? {
    cotacao  = local.run_url.fake_services
    apolice  = local.run_url.fake_services
    sinistro = local.run_url.fake_services
  } : var.service_urls

  labels = {
    app        = "seguradora"
    managed-by = "terraform"
  }
}

resource "google_project_service" "apis" {
  for_each = local.apis

  project = var.project_id
  service = each.value
  # Keep APIs on destroy: disabling them can break other things in the project.
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo
  format        = "DOCKER"
  description   = "Images of the seguradora POC (web, gateway, chatbot, fake-services)."
  labels        = local.labels

  # Keep the 10 most recent versions of each image; delete older ones (cost control).
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }

  depends_on = [google_project_service.apis]
}
