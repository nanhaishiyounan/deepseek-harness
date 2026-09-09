export const procurementRoutes = {
  spendAnalysis: "/procurement-spend",
  purchaseOrders: "/purchase-orders",
  purchaseOrdersCreate: "/purchase-orders/create",
  purchaseOrdersEdit: "/purchase-orders/edit/:id",
  purchaseOrdersShow: "/purchase-orders/show/:id",
  suppliers: "/suppliers",
  suppliersCreate: "/suppliers/create",
  suppliersEdit: "/suppliers/edit/:id",
  suppliersShow: "/suppliers/show/:id",
} as const;

export const getPurchaseOrderShowPath = (id: string | number) =>
  `/purchase-orders/show/${encodeURIComponent(id)}`;

export const getSupplierShowPath = (id: string | number) =>
  `/suppliers/show/${encodeURIComponent(id)}`;
