SELECT a.type_id, a.alias, n.id AS node_id, n.name AS node_name, n.type_id AS node_type,
  COALESCE(n.natural_key, n.name) AS entity_key
FROM kg_aliases a
JOIN kg_nodes n ON n.id = a.node_id
WHERE a.tenant_id = ? AND (? IS NULL OR a.type_id = ?)
ORDER BY n.rowid
