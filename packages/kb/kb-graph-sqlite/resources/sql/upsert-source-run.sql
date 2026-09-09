INSERT INTO kg_source_runs (source_system, scope, watermark, content_hash, run_config, last_run_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (source_system, scope) DO UPDATE SET
  watermark = excluded.watermark,
  content_hash = excluded.content_hash,
  run_config = excluded.run_config,
  last_run_at = excluded.last_run_at
