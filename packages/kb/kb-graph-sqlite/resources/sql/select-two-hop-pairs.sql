-- Paths of at most two edges entity — mid — target, undirected. Each branch
-- fixes one direction combination and pins the shared middle endpoint by
-- node id; the middle is excluded from both endpoints, so a spur, a fan-in
-- edge, or a target self-loop cannot pose as a bridge. The direct edge is
-- added by select-edges-between.
SELECT DISTINCT e1.rowid AS first_id, e2.rowid AS second_id
FROM kg_edges e1
JOIN kg_edges e2 ON e2.rowid <> e1.rowid AND e2.tenant_id = e1.tenant_id
WHERE e1.tenant_id = ?
  AND e1.valid_until IS NULL AND e1.expired_at IS NULL
  AND e2.valid_until IS NULL AND e2.expired_at IS NULL
  AND (
    (e1.src_id = ? AND e2.dst_id = ? AND e1.dst_id = e2.src_id
      AND e1.dst_id <> ? AND e1.dst_id <> ?)
    OR (e1.src_id = ? AND e2.src_id = ? AND e1.dst_id = e2.dst_id
      AND e1.dst_id <> ? AND e1.dst_id <> ?)
    OR (e1.dst_id = ? AND e2.dst_id = ? AND e1.src_id = e2.src_id
      AND e1.src_id <> ? AND e1.src_id <> ?)
    OR (e1.dst_id = ? AND e2.src_id = ? AND e1.src_id = e2.dst_id
      AND e1.src_id <> ? AND e1.src_id <> ?)
  )
