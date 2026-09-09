INSERT INTO usage_counters (tenant_id, loaded_tables, lakehouse_queries)
VALUES (?, ?, ?)
ON CONFLICT (tenant_id) DO UPDATE SET
  loaded_tables = loaded_tables + excluded.loaded_tables,
  lakehouse_queries = lakehouse_queries + excluded.lakehouse_queries;
