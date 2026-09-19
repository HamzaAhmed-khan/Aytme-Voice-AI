variable "aws_region" {
  default = "us-east-1"
}

variable "project_name" {
  default = "aytme"
}

variable "db_password" {
  description = "Database administrator password"
  type        = string
  sensitive   = true
}
