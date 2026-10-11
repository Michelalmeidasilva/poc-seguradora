# Optional monthly budget alert for this project (spec section 13). Only created when
# billing_account_id is set. The applier needs roles/billing.costsManager (or billing admin) on
# the billing account; this stack does not grant billing-account roles.
resource "google_monitoring_notification_channel" "budget_email" {
  count = var.billing_account_id != "" && var.budget_alert_email != "" ? 1 : 0

  project      = var.project_id
  display_name = "seguradora budget alerts"
  type         = "email"
  labels = {
    email_address = var.budget_alert_email
  }

  depends_on = [google_project_service.apis]
}

resource "google_billing_budget" "monthly" {
  count = var.billing_account_id == "" ? 0 : 1

  billing_account = var.billing_account_id
  display_name    = "seguradora-${var.project_id}"

  budget_filter {
    projects        = ["projects/${data.google_project.project.number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = "BRL"
      units         = tostring(floor(var.budget_amount_brl))
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = google_monitoring_notification_channel.budget_email[*].id
    # Billing account admins keep receiving the default e-mails.
    disable_default_iam_recipients = false
  }

  depends_on = [google_project_service.apis]
}
