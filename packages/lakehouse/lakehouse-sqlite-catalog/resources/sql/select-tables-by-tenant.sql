SELECT tenant_id, table_name, columns_json, format, location, row_count, provider, scope, collected_source, created_at, updated_at
FROM lakehouse_tables
WHERE tenant_id = ?
ORDER BY table_name;
