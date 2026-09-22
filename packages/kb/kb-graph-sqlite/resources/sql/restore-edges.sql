UPDATE kg_edges
SET expired_at = NULL
WHERE id = ? AND expired_at IS NOT NULL
