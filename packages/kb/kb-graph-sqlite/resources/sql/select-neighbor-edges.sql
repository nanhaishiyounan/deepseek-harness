SELECT
  e.rowid AS row_id, e.tenant_id, e.source_system, e.source_id, e.relation_id,
  s.type_id AS subject_type, COALESCE(s.natural_key, s.name) AS subject_id,
  d.type_id AS object_type, COALESCE(d.natural_key, d.name) AS object_id
FROM kg_edges e
JOIN kg_nodes s ON s.id = e.src_id
JOIN kg_nodes d ON d.id = e.dst_id
WHERE e.tenant_id = ? AND e.valid_until IS NULL AND e.expired_at IS NULL
  AND ((s.type_id = ? AND s.natural_key = ?) OR (d.type_id = ? AND d.natural_key = ?))
ORDER BY e.rowid
