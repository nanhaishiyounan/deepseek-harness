-- Full registry read for the boot-time re-registration pass (the two-layer
-- registry's read path). Insertion order keeps parent types ahead of the
-- types that extend them.
SELECT
  type_id, label, description, layer, extends_type, props_schema, natural_key,
  source, status, created_at, updated_at
FROM kg_node_types
ORDER BY created_at, type_id
