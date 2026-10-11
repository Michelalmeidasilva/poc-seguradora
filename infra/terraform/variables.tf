variable "project_id" {
  description = "GCP project id that hosts the whole stack (never commit a real one; set it in terraform.tfvars)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid GCP project id (6-30 chars, lowercase letters, digits and hyphens)."
  }
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and the subnet."
  type        = string
  default     = "southamerica-east1"
}

variable "image_tag" {
  description = "Tag of the four images in Artifact Registry (the deploy workflow passes the commit SHA or the release tag)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "image_tag must be a valid Docker tag."
  }
}

variable "artifact_registry_repo" {
  description = "Artifact Registry Docker repository id. Images: <region>-docker.pkg.dev/<project>/<repo>/{web,gateway,chatbot,fake-services}:<image_tag>."
  type        = string
  default     = "seguradora"
}

variable "trust_proxy_hops" {
  description = "TRUST_PROXY_HOPS of the gateway: proxies in front of it (client -> Google front end -> web nginx -> Google front end -> gateway = 3). Verify it from the gateway logs on the first deploy (runbook)."
  type        = number
  default     = 3

  validation {
    condition     = var.trust_proxy_hops >= 0 && floor(var.trust_proxy_hops) == var.trust_proxy_hops
    error_message = "trust_proxy_hops must be a non-negative integer."
  }
}

variable "web_custom_domain_url" {
  description = "Public URL of the web when a custom domain is mapped (e.g. https://chat.example.com, no trailing slash). Empty = the Cloud Run URL. It becomes the gateway's ALLOWED_ORIGIN."
  type        = string
  default     = ""

  validation {
    condition     = var.web_custom_domain_url == "" || can(regex("^https://[^/]+$", var.web_custom_domain_url))
    error_message = "web_custom_domain_url must be empty or https://<host> without path or trailing slash."
  }
}

variable "billing_account_id" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) for the optional budget alert. Empty = no budget."
  type        = string
  default     = ""
}

variable "budget_amount_brl" {
  description = "Monthly budget in BRL (the billing account currency must be BRL). Alerts at 50%, 90% and 100%."
  type        = number
  default     = 200

  validation {
    condition     = var.budget_amount_brl > 0
    error_message = "budget_amount_brl must be positive."
  }
}

variable "budget_alert_email" {
  description = "Extra e-mail for the budget alerts (a Cloud Monitoring notification channel). Empty = only the billing account admins are notified."
  type        = string
  default     = ""
}

variable "deploy_fake_services" {
  description = "Deploy the fake-services Cloud Run service (cotação, apólice, sinistro) while the real svc-* do not exist. When false, service_urls is required."
  type        = bool
  default     = true
}

variable "service_urls" {
  description = "Base URLs of the real internal services, used by the chatbot when deploy_fake_services = false. They must be reachable through the VPC (no NAT: no internet egress)."
  type = object({
    cotacao  = string
    apolice  = string
    sinistro = string
  })
  default = null

  validation {
    condition     = var.deploy_fake_services || var.service_urls != null
    error_message = "service_urls is required when deploy_fake_services = false."
  }
}

variable "log_level" {
  description = "LOG_LEVEL of the gateway and the chatbot."
  type        = string
  default     = "info"

  validation {
    condition     = contains(["fatal", "error", "warn", "info", "debug", "trace", "silent"], var.log_level)
    error_message = "log_level must be one of fatal, error, warn, info, debug, trace, silent."
  }
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to deploy through Workload Identity Federation. Empty = no WIF pool/provider."
  type        = string
  default     = ""

  validation {
    condition     = var.github_repository == "" || can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be empty or owner/name."
  }
}

variable "github_deploy_branch" {
  description = "Branch allowed to deploy through Workload Identity Federation (besides v* tags), always together with the GitHub environment production. Plain branch name, no wildcard."
  type        = string
  default     = "master"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$", var.github_deploy_branch)) && !strcontains(var.github_deploy_branch, "..") && !endswith(var.github_deploy_branch, "/") && !endswith(var.github_deploy_branch, ".lock")
    error_message = "github_deploy_branch must be a plain branch name (letters, digits, . _ / -; no wildcard, no .., no trailing / or .lock)."
  }
}
