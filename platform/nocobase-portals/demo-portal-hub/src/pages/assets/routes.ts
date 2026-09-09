export const assetsRoutes = {
  // Assets register (signature primary list)
  assets: "/asset-registry",
  assetsCreate: "/asset-registry/create",
  assetsEdit: "/asset-registry/edit/:id",
  assetsShow: "/asset-registry/show/:id",
  // Assignments
  assignments: "/assignments",
  assignmentsCreate: "/assignments/create",
  assignmentsEdit: "/assignments/edit/:id",
  // Maintenance records (collection-backed CRUD list)
  maintenance: "/asset-maintenance",
  maintenanceCreate: "/asset-maintenance/create",
  maintenanceEdit: "/asset-maintenance/edit/:id",
  maintenanceShow: "/asset-maintenance/show/:id",
  // Book-value / depreciation analytics over the register
  ledger: "/asset-ledger",
} as const;

export const getAssetShowPath = (id: string | number) =>
  `/asset-registry/show/${encodeURIComponent(String(id))}`;

export const getAssetEditPath = (id: string | number) =>
  `/asset-registry/edit/${encodeURIComponent(String(id))}`;

export const getMaintenanceShowPath = (id: string | number) =>
  `/asset-maintenance/show/${encodeURIComponent(String(id))}`;
