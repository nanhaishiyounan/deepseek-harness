CREATE TRIGGER fail_document_delete BEFORE DELETE ON documents BEGIN SELECT RAISE(ABORT, 'delete refused'); END
