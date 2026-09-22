-- Pipeline registry refresh (the kg-build write path): a fresh row inserts;
-- an existing row keeps its identity and created_at while every mutable
-- registry field takes the incoming value.
INSERT INTO kg_node_types (
  type_id, label, description, layer, extends_type, props_schema, natural_key,
  foodon_uri, foodon_id, synonyms_json, source, status, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (type_id) DO UPDATE SET
  label = excluded.label,
  description = excluded.description,
  layer = excluded.layer,
  extends_type = excluded.extends_type,
  props_schema = excluded.props_schema,
  natural_key = excluded.natural_key,
  foodon_uri = excluded.foodon_uri,
  foodon_id = excluded.foodon_id,
  synonyms_json = excluded.synonyms_json,
  source = excluded.source,
  status = excluded.status,
  updated_at = excluded.updated_at
