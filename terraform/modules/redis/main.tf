resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = var.cluster_id
  description                   = "AYTME Redis Replication Group"
  node_type                     = "cache.t4g.micro"
  port                          = 6379
  parameter_group_name          = "default.redis7"
  automatic_failover_enabled    = true
  
  engine                        = "redis"
  engine_version                = "7.0"
  
  subnet_group_name             = var.subnet_group_name
  security_group_ids            = var.security_group_ids
  
  at_rest_encryption_enabled    = true
  transit_encryption_enabled   = true
  
  maintenance_window            = "sun:05:00-sun:09:00"
  snapshot_retention_limit      = 7
  
  tags = var.tags
}
