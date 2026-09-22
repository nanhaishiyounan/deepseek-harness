-- Episode upsert: a duplicate uuid refreshes content and metadata in place
-- (the ledger's replay-safe write).
INSERT INTO kg_episode (uuid, tenant_id, source, name, content, valid_at, created_at, metadata)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (uuid) DO UPDATE SET
  source = excluded.source,
  name = excluded.name,
  content = excluded.content,
  valid_at = excluded.valid_at,
  metadata = excluded.metadata
