SELECT count(*) AS islands
FROM kg_nodes n
WHERE n.tenant_id = ?
  AND NOT EXISTS (
    SELECT 1 FROM kg_edges e
    WHERE e.tenant_id = n.tenant_id
      AND e.valid_until IS NULL
      AND e.expired_at IS NULL
      AND (e.src_id = n.id OR e.dst_id = n.id)
  )
