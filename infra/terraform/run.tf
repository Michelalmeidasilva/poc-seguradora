# Infrastructure belongs to Terraform; deployed images belong to deploy.sh.
resource "google_cloud_run_v2_service" "web" {
  project             = var.project_id
  name                = local.service_names.web
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account                  = google_service_account.web.email
    timeout                          = "3600s"
    max_instance_request_concurrency = 250 # each open chat holds one SSE request

    scaling {
      min_instance_count = var.service_scaling.web.min_instances
      max_instance_count = var.service_scaling.web.max_instances
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      env {
        # Public gateway URL, no trailing path: nginx proxies same-origin /v1 to it.
        name  = "GATEWAY_URL"
        value = local.run_url.gateway
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.service_scaling.web.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "gateway" {
  project             = var.project_id
  name                = local.service_names.gateway
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account                  = google_service_account.gateway.email
    timeout                          = "3600s"
    session_affinity                 = true
    max_instance_request_concurrency = 250 # each open chat holds one SSE request

    scaling {
      min_instance_count = var.service_scaling.gateway.min_instances
      max_instance_count = var.service_scaling.gateway.max_instances
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      env {
        name  = "CHATBOT_URL"
        value = local.run_url.chatbot
      }
      env {
        name = "SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_secret.secret_id
            version = google_secret_manager_secret_version.session_secret.version
          }
        }
      }
      env {
        # The browser only talks to the web origin (nginx proxies /v1), so the cookie is first-party.
        name  = "ALLOWED_ORIGIN"
        value = local.web_public_url
      }
      env {
        name  = "COOKIE_SECURE"
        value = "true"
      }
      env {
        name  = "COOKIE_SAME_SITE"
        value = "lax"
      }
      env {
        name  = "TRUST_PROXY_HOPS"
        value = tostring(var.trust_proxy_hops)
      }
      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.service_scaling.gateway.memory
        }
        # SSE connections and heartbeats run outside request processing time.
        cpu_idle          = false
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.gateway_session_secret,
  ]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "chatbot" {
  project             = var.project_id
  name                = local.service_names.chatbot
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account  = google_service_account.chatbot.email
    session_affinity = true

    scaling {
      min_instance_count = var.service_scaling.chatbot.min_instances
      max_instance_count = var.service_scaling.chatbot.max_instances
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      env {
        name  = "COTACAO_URL"
        value = local.run_url.svc_cotacao
      }
      env {
        name  = "APOLICE_URL"
        value = local.run_url.svc_apolice
      }
      env {
        name  = "SINISTRO_URL"
        value = local.run_url.svc_sinistro
      }
      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.service_scaling.chatbot.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "svc_cotacao" {
  project             = var.project_id
  name                = local.service_names.svc_cotacao
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account  = google_service_account.svc_cotacao.email
    session_affinity = true

    scaling {
      min_instance_count = var.service_scaling.svc_cotacao.min_instances
      max_instance_count = var.service_scaling.svc_cotacao.max_instances
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.service_scaling.svc_cotacao.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "svc_apolice" {
  project             = var.project_id
  name                = local.service_names.svc_apolice
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account  = google_service_account.svc_apolice.email
    session_affinity = true

    scaling {
      min_instance_count = var.service_scaling.svc_apolice.min_instances
      max_instance_count = var.service_scaling.svc_apolice.max_instances
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.service_scaling.svc_apolice.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service" "svc_sinistro" {
  project             = var.project_id
  name                = local.service_names.svc_sinistro
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account  = google_service_account.svc_sinistro.email
    session_affinity = true

    scaling {
      min_instance_count = var.service_scaling.svc_sinistro.min_instances
      max_instance_count = var.service_scaling.svc_sinistro.max_instances
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.service_scaling.svc_sinistro.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service_iam_member" "web_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "gateway_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "chatbot_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.chatbot.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "svc_cotacao_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.svc_cotacao.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "svc_apolice_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.svc_apolice.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "svc_sinistro_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.svc_sinistro.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
