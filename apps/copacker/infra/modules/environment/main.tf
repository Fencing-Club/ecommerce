terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.0"
    }
  }
}

variable "account_id" {
  type = string
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Only persistent staging and production infrastructure belongs in this module."
  }
}

resource "cloudflare_r2_bucket" "documents" {
  account_id    = var.account_id
  name          = "copacker-${var.environment}-private"
  jurisdiction  = "default"
  location      = "wnam"
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "jobs" {
  for_each   = toset(["jobs", "dead_letter"])
  account_id = var.account_id
  queue_name = "copacker-jobs-${var.environment}${each.key == "dead_letter" ? "-dlq" : ""}"
  settings = {
    delivery_delay           = 0
    message_retention_period = 345600
  }

  lifecycle {
    prevent_destroy = true
  }
}

output "documents_bucket" {
  value = cloudflare_r2_bucket.documents.name
}

output "jobs_queue_id" {
  value = cloudflare_queue.jobs["jobs"].id
}

output "dead_letter_queue_id" {
  value = cloudflare_queue.jobs["dead_letter"].id
}
