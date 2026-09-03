SELECT c.id AS chunk_id, c.doc_id, d.tenant_id, d.source_path, d.title, d.doc_kind, d.collected_at,
       c.heading_path, c.chunk_idx, c.content, d.provider, d.scope, d.collected_source, d.content_hash, d.content_length
FROM chunks c
JOIN documents d ON d.id = c.doc_id
WHERE c.content LIKE ? ESCAPE '\' AND (? IS NULL OR d.tenant_id = ? OR d.scope = 'share') AND (? IS NULL OR d.doc_kind = ?)
ORDER BY c.id
LIMIT ?
