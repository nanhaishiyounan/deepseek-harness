-- Edges whose endpoints both appear in the JSON node-id array (the subgraph
-- cut); only live edges (fact-valid and record-live), in row order.
SELECT
  e.id, e.tenant_id, e.src_id, e.dst_id, e.relation_id, e.fact, e.props,
  e.confidence, e.source_system, e.source_id, e.extracted_at, e.valid_from,
  e.valid_until, e.expired_at, e.recorded_at
FROM kg_edges e
WHERE e.tenant_id = ? AND e.valid_until IS NULL AND e.expired_at IS NULL
  AND e.src_id IN (SELECT value FROM json_each(?))
  AND e.dst_id IN (SELECT value FROM json_each(?))
ORDER BY e.rowid
LIMIT ?
