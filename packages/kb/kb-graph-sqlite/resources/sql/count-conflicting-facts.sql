SELECT count(*) AS conflicts FROM (
  SELECT src_id, dst_id, relation_id
  FROM kg_edges
  WHERE tenant_id = ? AND valid_until IS NULL
  GROUP BY src_id, dst_id, relation_id
  HAVING count(DISTINCT COALESCE(fact, '')) > 1
)
