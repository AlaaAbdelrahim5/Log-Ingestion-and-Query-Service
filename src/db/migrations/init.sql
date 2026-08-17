CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TABLE logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp timestamptz NOT NULL,
  level log_level NOT NULL,
  service text NOT NULL,
  message text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX logs_timestamp_id_idx ON logs USING btree (timestamp, id);
CREATE INDEX logs_timestamp_brin_idx ON logs USING brin (timestamp) WITH (pages_per_range = 32);

ALTER TABLE logs SET (
  autovacuum_vacuum_threshold = 200000,
  autovacuum_analyze_threshold = 200000,
  autovacuum_vacuum_scale_factor = 0.5,
  autovacuum_analyze_scale_factor = 0.5
);

CREATE TABLE log_rollups (
  bucket_start timestamptz NOT NULL,
  service text NOT NULL,
  level log_level NOT NULL,
  count int NOT NULL,
  PRIMARY KEY (bucket_start, service, level)
);
