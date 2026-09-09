SELECT id, source, destination, dataset_id, rows, transferred_at
FROM lakehouse_transfers
ORDER BY id DESC
LIMIT ?;
