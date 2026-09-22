-- Ignoring conflicts makes this both the fresh-database seed statement and
-- the write-path ensure statement (existing registry rows always win).
INSERT OR IGNORE INTO kg_relations (
  relation_id, label, description, domain_type, range_type, constraints_json,
  kind, inverse_of, foodon_prop_uri, source, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
