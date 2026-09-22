UPDATE kg_edges
SET confidence = MAX(confidence, ?),
    fact = COALESCE(?, fact),
    props = COALESCE(?, props),
    valid_until = NULL,
    expired_at = NULL,
    extracted_at = ?,
    recorded_at = ?
WHERE id = ?
