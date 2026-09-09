export type AssetRecord = {
  id: number | string;
  tag?: string | null;
  name?: string | null;
  category?: string | null;
  status?: string | null;
  purchase_date?: string | null;
  value?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AssetFormValues = {
  tag: string;
  name: string;
  category: string | null;
  status: string;
  purchase_date: string | null;
  value: number | null;
};

export type AssigneeRef = {
  id: number | string;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
};

export type AssignmentRecord = {
  id: number | string;
  asset_id?: number | string | null;
  asset?: AssetRecord | null;
  assignee_id?: number | string | null;
  assignee?: AssigneeRef | null;
  assigned_date?: string | null;
  returned_date?: string | null;
  note?: string | null;
  createdAt?: string | null;
};

export type AssignmentFormValues = {
  asset_id: number | string | null;
  assignee_id: number | string | null;
  assigned_date: string | null;
  returned_date: string | null;
  note: string;
};

export type MaintenanceRecord = {
  id: number | string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  completed_date?: string | null;
  cost?: number | null;
  vendor?: string | null;
  notes?: string | null;
  assetId?: number | string | null;
  asset?: AssetRecord | null;
  createdAt?: string | null;
};

export type MaintenanceFormValues = {
  title: string;
  assetId: number | string | null;
  type: string | null;
  status: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  cost: number | null;
  vendor: string;
  notes: string;
};
