INSERT INTO usage_counters (tenant_id, searches, ingested_documents, ingested_chunks, embed_texts, embed_tokens)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id) DO UPDATE SET
  searches = searches + excluded.searches,
  ingested_documents = ingested_documents + excluded.ingested_documents,
  ingested_chunks = ingested_chunks + excluded.ingested_chunks,
  embed_texts = embed_texts + excluded.embed_texts,
  embed_tokens = embed_tokens + excluded.embed_tokens;
