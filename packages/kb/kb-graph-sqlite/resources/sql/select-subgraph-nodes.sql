-- k-hop neighborhood walk: undirected, live edges only (fact-valid and
-- record-live). The recursive CTE's UNION deduplicates visited nodes, so
-- cycles terminate naturally; seeds arrive as a JSON array so the statement
-- stays fully parameterized.
WITH RECURSIVE walk(node_id, depth) AS (
  SELECT value, 0 FROM json_each(?)
  UNION
  SELECT CASE WHEN e.src_id = w.node_id THEN e.dst_id ELSE e.src_id END,
         w.depth + 1
  FROM walk w
  JOIN kg_edges e
    ON e.tenant_id = ?
   AND (e.src_id = w.node_id OR e.dst_id = w.node_id)
   AND e.valid_until IS NULL
   AND e.expired_at IS NULL
  WHERE w.depth < ?
)
SELECT n.id, n.type_id, n.name, n.natural_key, MIN(w.depth) AS depth
FROM walk w
JOIN kg_nodes n ON n.id = w.node_id AND n.tenant_id = ?
GROUP BY n.id
ORDER BY depth, n.name
LIMIT ?
