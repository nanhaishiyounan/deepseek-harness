-- kg-graph-sqlite SCHEMA_VERSION 2 (property graph; evolves the v1 single
-- `triples` table). Application id "DSHG" is retained: same store identity,
-- new major format. A v1 database (user_version 1) is rejected, not migrated
-- — the graph is derived data with provenance and rebuilds from its sources.

-- ① Node type registry (persistent layer; built-in seed inserted by code).
CREATE TABLE kg_node_types (
  type_id      TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  description  TEXT,
  layer        TEXT NOT NULL,
  extends_type TEXT REFERENCES kg_node_types(type_id),
  props_schema TEXT NOT NULL,
  natural_key  TEXT,
  source       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- ② Relation registry. domain_type/range_type carry the first (primary)
-- constraint pair; constraints_json carries the full set — one relation may
-- allow several legal (domain, range) pairs (e.g. uses: product→ingredient,
-- product→additive). Unrestricted hierarchical relations (broader/related)
-- carry no primary pair, so both columns stay nullable.
CREATE TABLE kg_relations (
  relation_id      TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  description      TEXT,
  domain_type      TEXT REFERENCES kg_node_types(type_id),
  range_type       TEXT REFERENCES kg_node_types(type_id),
  constraints_json TEXT NOT NULL DEFAULT '[]',
  kind             TEXT NOT NULL,
  inverse_of       TEXT REFERENCES kg_relations(relation_id),
  source           TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- ③ Nodes. The v1 `{type, id}` shape survives as (type_id, natural_key);
-- name separates from the key; the embedding BLOB matches the kb convention.
CREATE TABLE kg_nodes (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  type_id     TEXT NOT NULL REFERENCES kg_node_types(type_id),
  natural_key TEXT,
  name        TEXT NOT NULL,
  summary     TEXT,
  props       TEXT,
  embedding   BLOB,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (tenant_id, type_id, natural_key)
) STRICT;
CREATE INDEX kg_nodes_tenant_type ON kg_nodes (tenant_id, type_id);
CREATE VIRTUAL TABLE kg_nodes_fts USING fts5(
  name, summary, content='kg_nodes', content_rowid='rowid', tokenize='trigram'
);
CREATE TRIGGER kg_nodes_fts_insert AFTER INSERT ON kg_nodes BEGIN
  INSERT INTO kg_nodes_fts(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
END;
CREATE TRIGGER kg_nodes_fts_delete AFTER DELETE ON kg_nodes BEGIN
  INSERT INTO kg_nodes_fts(kg_nodes_fts, rowid, name, summary)
  VALUES ('delete', old.rowid, old.name, old.summary);
END;
CREATE TRIGGER kg_nodes_fts_update AFTER UPDATE ON kg_nodes BEGIN
  INSERT INTO kg_nodes_fts(kg_nodes_fts, rowid, name, summary)
  VALUES ('delete', old.rowid, old.name, old.summary);
  INSERT INTO kg_nodes_fts(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
END;

-- ④ Edges. The v1 six-tuple UNIQUE survives, extended by the provenance pair
-- (source_system, source_id): parallel assertions of one business fact from
-- different sources coexist, each independently idempotent. Bitemporal
-- columns carry the tombstone semantics (valid_until NULL = currently true).
CREATE TABLE kg_edges (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  src_id        TEXT NOT NULL REFERENCES kg_nodes(id),
  dst_id        TEXT NOT NULL REFERENCES kg_nodes(id),
  relation_id   TEXT NOT NULL REFERENCES kg_relations(relation_id),
  fact          TEXT,
  props         TEXT,
  confidence    REAL NOT NULL DEFAULT 1.0,
  source_system TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  extracted_at  TEXT NOT NULL,
  valid_from    TEXT NOT NULL,
  valid_until   TEXT,
  recorded_at   TEXT NOT NULL,
  UNIQUE (tenant_id, src_id, dst_id, relation_id, source_system, source_id)
) STRICT;
CREATE INDEX kg_edges_src ON kg_edges (tenant_id, src_id, valid_until);
CREATE INDEX kg_edges_dst ON kg_edges (tenant_id, dst_id, valid_until);
CREATE INDEX kg_edges_prov ON kg_edges (source_system, source_id);

-- ⑤ Aliases. Logical entity-merge table: reversible (delete the row to undo),
-- zero edge migration. One alias resolves to one node per (tenant, type).
CREATE TABLE kg_aliases (
  tenant_id TEXT NOT NULL,
  type_id   TEXT NOT NULL,
  alias     TEXT NOT NULL,
  node_id   TEXT NOT NULL REFERENCES kg_nodes(id),
  PRIMARY KEY (tenant_id, type_id, alias)
) STRICT;

-- ⑥ Source-run watermarks. Incremental-scheduling cursor per (source, scope):
-- polling watermark, content fingerprint, and the run-config snapshot.
CREATE TABLE kg_source_runs (
  source_system TEXT NOT NULL,
  scope         TEXT NOT NULL,
  watermark     TEXT,
  content_hash  TEXT,
  run_config    TEXT,
  last_run_at   TEXT NOT NULL,
  PRIMARY KEY (source_system, scope)
) STRICT;

-- ⑦ Usage counters (the kb seam's counter pattern, KG dimensions).
CREATE TABLE kg_usage_counters (
  tenant_id         TEXT PRIMARY KEY,
  subgraph_queries  INTEGER NOT NULL DEFAULT 0,
  extracted_triples INTEGER NOT NULL DEFAULT 0,
  extraction_calls  INTEGER NOT NULL DEFAULT 0,
  merged_entities   INTEGER NOT NULL DEFAULT 0
) STRICT;
