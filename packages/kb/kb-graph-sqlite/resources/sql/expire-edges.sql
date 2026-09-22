UPDATE kg_edges
SET expired_at = ?
WHERE id = ? AND expired_at IS NULL
