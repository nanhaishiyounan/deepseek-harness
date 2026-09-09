UPDATE kg_edges
SET valid_until = ?
WHERE source_system = ? AND source_id = ? AND valid_until IS NULL
