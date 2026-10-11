terraform {
  required_version = ">= 1.10"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Partial configuration: the private state bucket is passed at init time, never committed.
  #   terraform init -backend-config="bucket=<TF_STATE_BUCKET>" -backend-config="prefix=seguradora"
  # The state holds the SESSION_SECRET value (random_password), so the bucket must be private.
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region

  # The Billing Budgets API requires a quota project when called with user credentials.
  user_project_override = true
  billing_project       = var.project_id
}
