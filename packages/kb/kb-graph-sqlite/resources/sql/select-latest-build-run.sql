SELECT id, tenant_id, started_at, finished_at, report_json, metrics_json, created_at
FROM kg_build_runs
WHERE tenant_id = ?
ORDER BY id DESC
LIMIT 1
