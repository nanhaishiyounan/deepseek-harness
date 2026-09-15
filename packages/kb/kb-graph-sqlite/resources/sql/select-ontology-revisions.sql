SELECT id, ontology_version, summary, changes_json, created_at
FROM kg_ontology_revisions
ORDER BY id DESC
LIMIT ?
