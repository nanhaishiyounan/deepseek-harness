SELECT COUNT(*) AS chunks, COUNT(c.embedding) AS embedded_chunks
FROM chunks c
JOIN documents d ON d.id = c.doc_id
WHERE (? IS NULL OR d.tenant_id = ?)
