variable "project_id" {
  description = "GCP project id that hosts the whole stack (set through infra/.env)."
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


variable "artifact_registry_repo" {
  description = "Artifact Registry Docker repository id. Image tags are managed by deploy.sh."
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



variable "log_level" {
  description = "LOG_LEVEL of the gateway and the chatbot."
  type        = string
  default     = "info"

  validation {
    condition     = contains(["fatal", "error", "warn", "info", "debug", "trace", "silent"], var.log_level)
    error_message = "log_level must be one of fatal, error, warn, info, debug, trace, silent."
  }
}


variable "service_scaling" {
  description = "Per-service minimum/maximum instances and memory; stateful services default to max 1."
  type        = map(object({ min_instances = number, max_instances = number, memory = string }))
  default = {
    web          = { min_instances = 0, max_instances = 2, memory = "256Mi" }
    gateway      = { min_instances = 0, max_instances = 1, memory = "512Mi" }
    chatbot      = { min_instances = 0, max_instances = 1, memory = "512Mi" }
    svc_cotacao  = { min_instances = 0, max_instances = 1, memory = "512Mi" }
    svc_apolice  = { min_instances = 0, max_instances = 1, memory = "512Mi" }
    svc_sinistro = { min_instances = 0, max_instances = 1, memory = "512Mi" }
  }
  validation {
    condition     = toset(keys(var.service_scaling)) == toset(["web", "gateway", "chatbot", "svc_cotacao", "svc_apolice", "svc_sinistro"]) && alltrue([for s in values(var.service_scaling) : s.min_instances >= 0 && floor(s.min_instances) == s.min_instances && s.max_instances >= 1 && floor(s.max_instances) == s.max_instances && s.min_instances <= s.max_instances && can(regex("^[1-9][0-9]*(Mi|Gi)$", s.memory))])
    error_message = "service_scaling must contain exactly six services with integer 0 <= min <= max, max >= 1 and memory in Mi or Gi."
  }
}
