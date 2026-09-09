SELECT a.type_id, COALESCE(n.natural_key, n.name) AS entity_key, a.alias
FROM kg_aliases a
JOIN kg_nodes n ON n.id = a.node_id
WHERE a.tenant_id = ? AND (? IS NULL OR a.type_id = ?)
ORDER BY n.rowid
