export const inventoryRoutes = {
  dashboard: "/inventory",
  reorder: "/reorder",
  // Multi-location on-hand matrix + movement analytics
  stockMatrix: "/stock-by-warehouse",
  turnover: "/inventory-turnover",
  products: "/products",
  productsCreate: "/products/create",
  productsEdit: "/products/edit/:id",
  productsShow: "/products/show/:id",
  warehouses: "/warehouses",
  warehousesCreate: "/warehouses/create",
  warehousesEdit: "/warehouses/edit/:id",
  warehousesShow: "/warehouses/show/:id",
  stockMoves: "/stock-moves",
  stockMovesCreate: "/stock-moves/create",
  stockMovesEdit: "/stock-moves/edit/:id",
  stockMovesShow: "/stock-moves/show/:id",
} as const;
