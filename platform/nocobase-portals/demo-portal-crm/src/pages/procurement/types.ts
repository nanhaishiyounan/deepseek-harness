export type SupplierStatus = "active" | "inactive";
export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

export type SupplierRecord = {
  id: string | number;
  name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  rating?: number | null;
  status?: SupplierStatus | null;
  createdAt?: string | null;
};

export type OwnerRef = {
  id: string | number;
  nickname?: string | null;
  username?: string | null;
};

export type PurchaseOrderRecord = {
  id: string | number;
  po_number?: string | null;
  status?: PurchaseOrderStatus | null;
  order_date?: string | null;
  total?: number | null;
  supplier_id?: string | number | null;
  owner_id?: string | number | null;
  supplier?: SupplierRecord | null;
  owner?: OwnerRef | null;
  items?: PoItemRecord[] | null;
};

export type PoItemRecord = {
  id: string | number;
  purchase_order_id?: string | number | null;
  product_name?: string | null;
  qty?: number | null;
  unit_price?: number | null;
};

export type SupplierFormValues = {
  name: string;
  contact_name: string | null;
  email: string | null;
  rating: number | null;
  status: SupplierStatus;
};

export type PurchaseOrderFormValues = {
  po_number: string;
  supplier_id: string | null;
  owner_id: string | null;
  status: PurchaseOrderStatus;
  order_date: string | null;
  total: number | null;
};

export type PoItemFormValues = {
  product_name: string;
  qty: number | null;
  unit_price: number | null;
};
