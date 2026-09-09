-- Name/natural-key search input: candidate nodes of one tenant, optionally
-- narrowed to one type, in insertion order. The caller applies the substring
-- match (name / natural_key / id) and the result cap.
SELECT id, type_id, name, natural_key
FROM kg_nodes
WHERE tenant_id = ? AND (? IS NULL OR type_id = ?)
ORDER BY rowid
