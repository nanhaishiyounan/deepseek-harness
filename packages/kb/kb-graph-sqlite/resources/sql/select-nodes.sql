SELECT id, tenant_id, type_id, natural_key, name, summary, props, created_at, updated_at
FROM kg_nodes
WHERE tenant_id = ?
ORDER BY rowid
LIMIT ?
