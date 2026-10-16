terraform {
  required_version = "= 1.16.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.0"
    }
  }
  backend "s3" {
    key                         = "copacker/production/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

provider "cloudflare" {}

module "environment" {
  source      = "../modules/environment"
  account_id  = "544b5bfd594cd02a5da4b79a2038cc9f"
  environment = "production"
}

import {
  to = module.environment.cloudflare_r2_bucket.documents
  id = "544b5bfd594cd02a5da4b79a2038cc9f/copacker-production-private/default"
}

import {
  to = module.environment.cloudflare_queue.jobs["jobs"]
  id = "544b5bfd594cd02a5da4b79a2038cc9f/3a7d526f41404476a7e7e331d927f417"
}

import {
  to = module.environment.cloudflare_queue.jobs["dead_letter"]
  id = "544b5bfd594cd02a5da4b79a2038cc9f/9a6b5d80de18475c8f8b623b19061633"
}

output "release_resources" {
  value = module.environment
}
