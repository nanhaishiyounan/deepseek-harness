-- The PPR input: undirected live endpoint pairs, capped.
SELECT e.src_id, e.dst_id
FROM kg_edges e
WHERE e.tenant_id = ? AND e.valid_until IS NULL AND e.expired_at IS NULL
ORDER BY e.rowid
LIMIT ?
