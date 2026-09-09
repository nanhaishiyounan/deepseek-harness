SELECT id, type_id, COALESCE(natural_key, name) AS entity_key, name
FROM kg_nodes
WHERE tenant_id = ? AND (? IS NULL OR type_id = ?)
ORDER BY rowid
