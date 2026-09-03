SELECT searches, ingested_documents, ingested_chunks, embed_texts, embed_tokens
FROM usage_counters
WHERE tenant_id = ?;
