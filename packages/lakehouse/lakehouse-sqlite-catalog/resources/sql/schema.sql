CREATE TABLE lakehouse_tables (
  id           INTEGER PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  table_name   TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  format       TEXT NOT NULL,
  location     TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  provider     TEXT,
  scope        TEXT,
  collected_source TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (tenant_id, table_name)
) STRICT;

CREATE TABLE lakehouse_transfers (
  id             INTEGER PRIMARY KEY,
  source         TEXT NOT NULL,
  destination    TEXT NOT NULL,
  dataset_id     TEXT NOT NULL,
  rows           INTEGER NOT NULL,
  transferred_at TEXT NOT NULL
) STRICT;

CREATE TABLE usage_counters (
  tenant_id         TEXT PRIMARY KEY,
  loaded_tables     INTEGER NOT NULL,
  lakehouse_queries INTEGER NOT NULL
) STRICT;
