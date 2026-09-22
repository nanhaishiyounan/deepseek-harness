SELECT
  m.episode_uuid, m.edge_id, m.created_at,
  ep.tenant_id AS episode_tenant, ep.source AS episode_source, ep.name AS episode_name,
  ep.content AS episode_content, ep.valid_at AS episode_valid_at,
  ep.created_at AS episode_created_at, ep.metadata AS episode_metadata
FROM kg_mention m
JOIN kg_episode ep ON ep.uuid = m.episode_uuid
WHERE m.edge_id = ?
ORDER BY m.created_at
