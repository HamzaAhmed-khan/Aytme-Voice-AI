variable "vpc_id" {}
variable "db_name" {}
variable "db_user" {}
variable "db_pass" {
  type      = string
  sensitive = true
}
variable "db_subnet_group_name" {}
