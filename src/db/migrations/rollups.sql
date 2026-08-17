CREATE TABLE IF NOT EXISTS log_rollups (
  bucket_start timestamptz NOT NULL,
  service text NOT NULL,
  level log_level NOT NULL,
  count int NOT NULL,
  PRIMARY KEY (bucket_start, service, level)
);

ALTER TABLE logs SET (
  autovacuum_vacuum_threshold = 200000,
  autovacuum_analyze_threshold = 200000,
  autovacuum_vacuum_scale_factor = 0.5,
  autovacuum_analyze_scale_factor = 0.5
);
