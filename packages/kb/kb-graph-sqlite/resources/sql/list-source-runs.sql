SELECT source_system, scope, watermark, content_hash, run_config, last_run_at
FROM kg_source_runs
WHERE source_system = ?
ORDER BY scope
