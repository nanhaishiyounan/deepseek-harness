-- Revision-replay node cut: nodes created at or before the frozen instant,
-- in row order (the snapshot canvas keeps insertion order stable).
SELECT n.id, n.type_id, n.name, n.natural_key
FROM kg_nodes n
WHERE n.tenant_id = ? AND n.created_at <= ?
ORDER BY n.rowid
LIMIT ?
