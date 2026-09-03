SELECT c.id AS chunk_id, c.embedding
FROM chunks c
JOIN documents d ON d.id = c.doc_id
WHERE c.embedding IS NOT NULL AND (? IS NULL OR d.tenant_id = ? OR d.scope = 'share') AND (? IS NULL OR d.doc_kind = ?)
