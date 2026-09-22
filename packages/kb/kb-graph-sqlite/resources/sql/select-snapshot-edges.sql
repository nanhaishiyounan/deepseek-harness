-- Revision-replay edge cut: rows recorded at or before the frozen instant
-- that were neither tombstoned (valid_until) nor record-retired (expired_at)
-- before it, with both endpoints inside the node cut.
SELECT
  e.id, e.tenant_id, e.src_id, e.dst_id, e.relation_id, e.fact, e.props,
  e.confidence, e.source_system, e.source_id, e.extracted_at, e.valid_from,
  e.valid_until, e.expired_at, e.recorded_at
FROM kg_edges e
WHERE e.tenant_id = ?
  AND e.recorded_at <= ?
  AND (e.valid_until IS NULL OR e.valid_until > ?)
  AND (e.expired_at IS NULL OR e.expired_at > ?)
  AND e.src_id IN (SELECT value FROM json_each(?))
  AND e.dst_id IN (SELECT value FROM json_each(?))
ORDER BY e.rowid
LIMIT ?
