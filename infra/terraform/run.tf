# The four Cloud Run services. Settings follow the Plan 7 Global Constraints:
# - gateway and chatbot keep session/turn state in memory: max 1 instance + session affinity
#   (fake-services too, so its in-memory fake data stays consistent);
# - web and gateway hold SSE connections: request timeout 3600s; only the gateway keeps CPU
#   allocated outside requests (cpu_idle = false);
# - chatbot and fake-services accept internal traffic only; gateway and chatbot reach them
#   through Direct VPC egress (ALL_TRAFFIC) on the private-Google-access subnet.
# Cloud Run sets PORT (8080) itself; it is a reserved variable and is not set here.

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
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = local.images.web

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
          memory = "256Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        http_get {
          path = "/health"
          port = 8080
        }
      }

      liveness_probe {
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
        http_get {
          path = "/health"
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
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
      min_instance_count = 0
      max_instance_count = 1
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = local.images.gateway

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
          memory = "512Mi"
        }
        # SSE connections and heartbeats run outside request processing time.
        cpu_idle          = false
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        http_get {
          path = "/health"
          port = 8080
        }
      }

      liveness_probe {
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
        http_get {
          path = "/health"
          port = 8080
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.gateway_session_secret,
  ]
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
      min_instance_count = 0
      max_instance_count = 1
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.run.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = local.images.chatbot

      ports {
        container_port = 8080
      }

      env {
        name  = "COTACAO_URL"
        value = local.internal_service_urls.cotacao
      }
      env {
        name  = "APOLICE_URL"
        value = local.internal_service_urls.apolice
      }
      env {
        name  = "SINISTRO_URL"
        value = local.internal_service_urls.sinistro
      }
      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        http_get {
          path = "/health"
          port = 8080
        }
      }

      liveness_probe {
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
        http_get {
          path = "/health"
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "fake_services" {
  count = var.deploy_fake_services ? 1 : 0

  project             = var.project_id
  name                = local.service_names.fake_services
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account  = google_service_account.fake_services.email
    session_affinity = true

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = local.images.fake_services

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # The fake has no /health (it only serves the services contract): TCP at startup and a
      # known claim as liveness, the same probe docker-compose uses.
      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        tcp_socket {
          port = 8080
        }
      }

      liveness_probe {
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
        http_get {
          path = "/v1/sinistros/SN-2001"
          port = 8080
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Invokers. web and gateway are public. chatbot and fake-services are also `allUsers` on IAM
# because today the gateway and the chatbot do not send Google ID tokens: a per-service-account
# invoker would answer 403. Their access control is the internal ingress (only traffic from the
# project's VPC reaches them). ID-token auth is a pendência (README).
resource "google_cloud_run_v2_service_iam_member" "web_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "gateway_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "chatbot_internal" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.chatbot.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "fake_services_internal" {
  count = var.deploy_fake_services ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.fake_services[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
