# VPC used only for Direct VPC egress of gateway and chatbot. With egress = ALL_TRAFFIC their
# calls to the internal-ingress services (chatbot, fake-services) leave through this subnet and
# reach *.run.app via Private Google Access, which Cloud Run treats as internal traffic.
# There is no Cloud NAT on purpose: the gateway and the chatbot need no internet egress.
resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "seguradora-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.apis]
}

resource "google_compute_subnetwork" "run" {
  project                  = var.project_id
  name                     = "seguradora-run"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}
