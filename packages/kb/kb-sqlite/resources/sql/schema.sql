CREATE TABLE documents (
  id           INTEGER PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  source_path  TEXT NOT NULL,
  title        TEXT,
  doc_kind     TEXT NOT NULL,
  collected_at TEXT,
  provider     TEXT,
  scope        TEXT,
  collected_source TEXT,
  content_hash TEXT,
  content_length INTEGER,
  UNIQUE (tenant_id, source_path)
) STRICT;

CREATE TABLE chunks (
  id           INTEGER PRIMARY KEY,
  doc_id       INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  heading_path TEXT,
  chunk_idx    INTEGER NOT NULL,
  content      TEXT NOT NULL,
  embed_model  TEXT,
  embedding    BLOB,
  UNIQUE (doc_id, chunk_idx)
) STRICT;

CREATE VIRTUAL TABLE chunks_fts USING fts5(content, chunk_id UNINDEXED, tokenize = 'trigram');

CREATE TABLE usage_counters (
  tenant_id          TEXT PRIMARY KEY,
  searches           INTEGER NOT NULL,
  ingested_documents INTEGER NOT NULL,
  ingested_chunks    INTEGER NOT NULL,
  embed_texts        INTEGER NOT NULL,
  embed_tokens       INTEGER NOT NULL
) STRICT;
