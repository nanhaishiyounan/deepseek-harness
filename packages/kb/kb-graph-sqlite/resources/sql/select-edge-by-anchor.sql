SELECT id FROM kg_edges
WHERE tenant_id = ? AND src_id = ? AND dst_id = ? AND relation_id = ?
  AND source_system = ? AND source_id = ?
