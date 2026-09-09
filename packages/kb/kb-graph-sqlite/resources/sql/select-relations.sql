-- Full relation-registry read for the boot-time re-registration pass (the
-- two-layer registry's read path). Insertion order keeps declared inverses
-- ahead of the relations referencing them where possible.
SELECT
  relation_id, label, description, domain_type, range_type, constraints_json,
  kind, inverse_of, source, created_at, updated_at
FROM kg_relations
ORDER BY created_at, relation_id
