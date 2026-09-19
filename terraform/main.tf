terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "./modules/vpc"
  project_name = var.project_name
}

module "eks" {
  source = "./modules/eks"
  project_name = var.project_name
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
}

module "rds" {
  source = "./modules/rds"
  vpc_id = module.vpc.vpc_id
  db_name = "aytme"
  db_user = "aytme"
  db_pass = var.db_password
}

module "redis" {
  source = "./modules/redis"
  vpc_id = module.vpc.vpc_id
}

module "s3" {
  source = "./modules/s3"
  bucket_name = "${var.project_name}-media-artifacts"
}
