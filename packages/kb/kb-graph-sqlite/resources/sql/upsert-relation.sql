-- Pipeline registry refresh (the kg-build write path): a fresh row inserts;
-- an existing row keeps its identity and created_at while every mutable
-- registry field takes the incoming value. domain_type/range_type carry the
-- first constraint pair; constraints_json carries the full set.
INSERT INTO kg_relations (
  relation_id, label, description, domain_type, range_type, constraints_json,
  kind, inverse_of, foodon_prop_uri, source, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (relation_id) DO UPDATE SET
  label = excluded.label,
  description = excluded.description,
  domain_type = excluded.domain_type,
  range_type = excluded.range_type,
  constraints_json = excluded.constraints_json,
  kind = excluded.kind,
  inverse_of = excluded.inverse_of,
  foodon_prop_uri = excluded.foodon_prop_uri,
  source = excluded.source,
  updated_at = excluded.updated_at
