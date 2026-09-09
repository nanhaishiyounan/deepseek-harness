INSERT INTO lakehouse_tables (tenant_id, table_name, columns_json, format, location, row_count, provider, scope, collected_source, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (tenant_id, table_name) DO UPDATE SET
  columns_json = excluded.columns_json,
  format = excluded.format,
  location = excluded.location,
  row_count = excluded.row_count,
  provider = excluded.provider,
  scope = excluded.scope,
  collected_source = excluded.collected_source,
  updated_at = excluded.updated_at;
