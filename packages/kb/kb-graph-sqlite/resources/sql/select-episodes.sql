SELECT
  ep.uuid, ep.tenant_id, ep.source, ep.name, ep.content, ep.valid_at,
  ep.created_at, ep.metadata,
  (SELECT count(*) FROM kg_mention m WHERE m.episode_uuid = ep.uuid) AS mention_count
FROM kg_episode ep
WHERE ep.tenant_id = ?
ORDER BY ep.created_at DESC, ep.uuid
LIMIT ?
