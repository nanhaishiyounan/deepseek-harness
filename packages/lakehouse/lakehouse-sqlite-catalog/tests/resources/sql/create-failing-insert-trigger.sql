CREATE TRIGGER fail_lakehouse_insert BEFORE INSERT ON lakehouse_tables
BEGIN
  SELECT RAISE(ABORT, 'injected failure');
END;
