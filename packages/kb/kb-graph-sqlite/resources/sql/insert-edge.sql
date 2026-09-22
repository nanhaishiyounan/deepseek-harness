INSERT INTO kg_edges (
  id, tenant_id, src_id, dst_id, relation_id, fact, props, confidence,
  source_system, source_id, extracted_at, valid_from, valid_until, recorded_at, expired_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
