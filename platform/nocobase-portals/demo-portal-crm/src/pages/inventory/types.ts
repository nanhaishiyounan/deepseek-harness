export type ProductRecord = {
  id: string | number;
  sku?: string;
  name?: string;
  category?: string | null;
  unit_price?: number | null;
  reorder_level?: number | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductFormValues = {
  sku: string;
  name: string;
  category: string | null;
  unit_price: number | null;
  reorder_level: number | null;
  status: string;
};

export type WarehouseRecord = {
  id: string | number;
  name?: string;
  code?: string | null;
  location?: string | null;
  createdAt?: string;
};

export type WarehouseFormValues = {
  name: string;
  code: string;
  location: string;
};

export type StockMoveRecord = {
  id: string | number;
  type?: string | null;
  qty?: number | null;
  moved_at?: string | null;
  note?: string | null;
  product_id?: string | number | null;
  warehouse_id?: string | number | null;
  product?: ProductRecord | null;
  warehouse?: WarehouseRecord | null;
  createdAt?: string;
};

export type StockMoveFormValues = {
  type: string;
  qty: number | null;
  moved_at: string | null;
  note: string;
  product_id: string | null;
  warehouse_id: string | null;
};
