INSERT INTO chunks_fts (content, chunk_id) VALUES (?, (SELECT id FROM chunks WHERE doc_id = ? AND chunk_idx = ?))
