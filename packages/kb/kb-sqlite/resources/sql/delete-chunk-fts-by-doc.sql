DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = ?)
