export const inventoryRoutes = {
  dashboard: "/inventory",
  reorder: "/reorder",
  // Multi-location on-hand matrix + movement analytics
  stockMatrix: "/stock-by-warehouse",
  turnover: "/inventory-turnover",
  // CRM-native /products (price book) owns the bare path in this portal, so
  // the inventory product catalog nests under the /inventory prefix.
  products: "/inventory/products",
  productsCreate: "/inventory/products/create",
  productsEdit: "/inventory/products/edit/:id",
  productsShow: "/inventory/products/show/:id",
  warehouses: "/warehouses",
  warehousesCreate: "/warehouses/create",
  warehousesEdit: "/warehouses/edit/:id",
  warehousesShow: "/warehouses/show/:id",
  stockMoves: "/stock-moves",
  stockMovesCreate: "/stock-moves/create",
  stockMovesEdit: "/stock-moves/edit/:id",
  stockMovesShow: "/stock-moves/show/:id",
} as const;
