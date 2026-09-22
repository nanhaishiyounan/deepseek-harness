SELECT COUNT(*) AS n
FROM kg_edges
WHERE (? IS NULL OR tenant_id = ?) AND valid_until IS NULL AND expired_at IS NULL
