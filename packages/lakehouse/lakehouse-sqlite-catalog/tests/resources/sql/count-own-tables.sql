SELECT
  (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'lakehouse_tables')
  + (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'lakehouse_transfers')
  + (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'usage_counters') AS n;
