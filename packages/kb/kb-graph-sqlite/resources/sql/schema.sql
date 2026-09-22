-- kg-graph-sqlite SCHEMA_VERSION 5 (the temporal + ontology-anchor format:
-- kg_episode/kg_mention ledger, kg_edges.expired_at record retirement,
-- ontology_xref mapping channel, and the registry's FoodOn anchor columns),
-- evolving the v4 build-run ledger format. Application id "DSHG" is
-- retained: same store identity, new major format. A v1-v4 database
-- (user_version < 5) is rejected, not migrated — the graph is derived data
-- with provenance and rebuilds from its sources.

-- ① Node type registry (persistent layer; built-in seed inserted by code).
-- `version` is the registry-row revision counter (1 at first persist).
-- foodon_uri/foodon_id anchor the class to its FoodOn term;
-- synonyms_json carries the source-ontology synonym set.
CREATE TABLE kg_node_types (
  type_id        TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  description    TEXT,
  layer          TEXT NOT NULL,
  extends_type   TEXT REFERENCES kg_node_types(type_id),
  props_schema   TEXT NOT NULL,
  natural_key    TEXT,
  foodon_uri     TEXT,
  foodon_id      TEXT,
  synonyms_json  TEXT,
  source         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- ② Relation registry. domain_type/range_type carry the first (primary)
-- constraint pair; constraints_json carries the full set — one relation may
-- allow several legal (domain, range) pairs, each with optional cardinality
-- bounds. foodon_prop_uri anchors the relation to its FoodOn object property.
CREATE TABLE kg_relations (
  relation_id      TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  description      TEXT,
  domain_type      TEXT REFERENCES kg_node_types(type_id),
  range_type       TEXT REFERENCES kg_node_types(type_id),
  constraints_json TEXT NOT NULL DEFAULT '[]',
  kind             TEXT NOT NULL,
  inverse_of       TEXT REFERENCES kg_relations(relation_id),
  foodon_prop_uri  TEXT,
  source           TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
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
-- different sources coexist, each independently idempotent. The four
-- timestamps follow the Graphiti episode model: valid_from/valid_until state
-- the fact's world validity (tombstones write valid_until), recorded_at
-- states row creation, expired_at retires the record itself (rollback mark;
-- live = valid_until IS NULL AND expired_at IS NULL).
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
  expired_at    TEXT,
  UNIQUE (tenant_id, src_id, dst_id, relation_id, source_system, source_id)
) STRICT;
CREATE INDEX kg_edges_src ON kg_edges (tenant_id, src_id, valid_until);
CREATE INDEX kg_edges_dst ON kg_edges (tenant_id, dst_id, valid_until);
CREATE INDEX kg_edges_prov ON kg_edges (source_system, source_id);
CREATE INDEX kg_edges_live ON kg_edges (tenant_id, src_id) WHERE valid_until IS NULL AND expired_at IS NULL;

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

-- ⑥b Episode ledger (the Graphiti temporal model): one row per instruction
-- or ingestion event that changed the graph, carrying the instruction text
-- verbatim and the diff JSON. kg_mention joins episodes to the edges they
-- touched — the「这条边来自哪次修改」reverse lookup and the rollback unit.
CREATE TABLE kg_episode (
  uuid       TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  source     TEXT NOT NULL,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  valid_at   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata   TEXT
) STRICT;
CREATE INDEX kg_episode_tenant ON kg_episode (tenant_id, created_at);
CREATE TABLE kg_mention (
  episode_uuid TEXT NOT NULL REFERENCES kg_episode(uuid),
  edge_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (episode_uuid, edge_id)
) STRICT;
CREATE INDEX kg_mention_edge ON kg_mention (edge_id);

-- ⑥c Ontology cross-references (the SSSOM-shaped mapping channel): FoodOn
-- imports and cross-facet edges land here; future FoodEx2 SSSOM sets ride
-- the same table.
CREATE TABLE ontology_xref (
  subject_id            TEXT NOT NULL,
  predicate_id          TEXT NOT NULL,
  object_id             TEXT NOT NULL,
  mapping_justification TEXT,
  PRIMARY KEY (subject_id, predicate_id, object_id)
) STRICT;

-- ⑥d Build-run ledger: one row per kg-build run() with the full report and
-- quality-metrics JSON — the run evidence survives the process.
CREATE TABLE kg_build_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL,
  report_json  TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
) STRICT;
CREATE INDEX kg_build_runs_tenant ON kg_build_runs (tenant_id, id);

-- ⑥e Ontology revision audit: one row per registry-changing pipeline run
-- (added/removed/changed type and relation ids ride changes_json). An
-- idempotent no-change run appends nothing.
CREATE TABLE kg_ontology_revisions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ontology_version TEXT NOT NULL,
  summary          TEXT NOT NULL,
  changes_json     TEXT NOT NULL,
  created_at       TEXT NOT NULL
) STRICT;

-- ⑦ Usage counters (the kb seam's counter pattern, KG dimensions).
CREATE TABLE kg_usage_counters (
  tenant_id         TEXT PRIMARY KEY,
  subgraph_queries  INTEGER NOT NULL DEFAULT 0,
  extracted_triples INTEGER NOT NULL DEFAULT 0,
  extraction_calls  INTEGER NOT NULL DEFAULT 0,
  merged_entities   INTEGER NOT NULL DEFAULT 0
) STRICT;

-- ⑧ Coreference reject tombstones: pairs the v2 LLM judge ruled different.
-- The next align pass reads the set and skips re-judging (and re-animating)
-- rejected pairs — the KB-leg tombstone lesson applied to the align leg.
CREATE TABLE kg_align_rejects (
  pair_key   TEXT PRIMARY KEY,
  doc_id     TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  reason     TEXT NOT NULL,
  decided_at TEXT NOT NULL
) STRICT;
