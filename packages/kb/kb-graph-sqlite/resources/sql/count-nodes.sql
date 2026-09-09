SELECT COUNT(*) AS n
FROM kg_nodes
WHERE (? IS NULL OR tenant_id = ?)
