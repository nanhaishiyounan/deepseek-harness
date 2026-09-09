-- Ignoring conflicts makes this both the fresh-database seed statement and
-- the write-path ensure statement (existing registry rows always win).
INSERT OR IGNORE INTO kg_node_types (
  type_id, label, description, layer, extends_type, props_schema, natural_key,
  source, status, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
