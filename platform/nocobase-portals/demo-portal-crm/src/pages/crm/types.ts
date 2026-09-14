/**
 * Stamps NocoBase writes on every collection. Appending `createdBy`/`updatedBy`
 * turns them into the record's audit panel.
 */
export type AuditableRecord = {
  id?: string | number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: UserRecord | null;
  updatedBy?: UserRecord | null;
};

export type CustomerRecord = AuditableRecord & {
  id: string | number;
  company_name?: string;
  ownerId?: string | number | null;
  owner?: UserRecord | null;
  industry?: string | null;
  status?: string | null;
  website?: string | null;
  phone?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomerFormValues = {
  company_name: string;
  industry: string | null;
  status: string | null;
  website: string;
  phone: string;
  notes: string;
  ownerId: string | number | null;
};

export type ContactRecord = AuditableRecord & {
  id: string | number;
  name?: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_id?: string | number | null;
  customer?: CustomerRecord | null;
  notes?: string | null;
  createdAt?: string;
};

export type ContactFormValues = {
  name: string;
  job_title: string;
  email: string;
  phone: string;
  customer_id: string | number | null;
  notes: string;
};

export type DealRecord = AuditableRecord & {
  id: string | number;
  title?: string;
  /** crm_deals carries the display name in `name`; hub_sales_deals uses title. */
  name?: string;
  stage?: string | null;
  amount?: number | null;
  expected_close_date?: string | null;
  closed_date?: string | null;
  customer_id?: string | number | null;
  contact_id?: string | number | null;
  ownerId?: string | number | null;
  customer?: CustomerRecord | null;
  contact?: ContactRecord | null;
  owner?: UserRecord | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DealFormValues = {
  title: string;
  stage: string;
  amount: number | null;
  expected_close_date: string | null;
  closed_date: string | null;
  customer_id: string | number | null;
  contact_id: string | number | null;
  ownerId: string | number | null;
  notes: string;
};

export type ActivityRecord = AuditableRecord & {
  id: string | number;
  subject?: string;
  type?: string | null;
  date?: string | null;
  customer_id?: string | number | null;
  contact_id?: string | number | null;
  dealId?: string | number | null;
  customer?: CustomerRecord | null;
  contact?: ContactRecord | null;
  deal?: DealRecord | null;
  notes?: string | null;
  createdAt?: string;
};

export type ActivityFormValues = {
  subject: string;
  type: string;
  date: string | null;
  customer_id: string | number | null;
  contact_id: string | number | null;
  notes: string;
};

export type FollowUpRecord = AuditableRecord & {
  id: string | number;
  subject?: string;
  due_date?: string | null;
  status?: string | null;
  customer_id?: string | number | null;
  ownerId?: string | number | null;
  dealId?: string | number | null;
  customer?: CustomerRecord | null;
  owner?: UserRecord | null;
  deal?: DealRecord | null;
  notes?: string | null;
  createdAt?: string;
};

export type FollowUpFormValues = {
  subject: string;
  due_date: string | null;
  status: string;
  customer_id: string | number | null;
  ownerId: string | number | null;
  notes: string;
};

export type UserRecord = {
  id: string | number;
  nickname?: string | null;
  email?: string | null;
};

export type LeadRecord = AuditableRecord & {
  id: string | number;
  name?: string;
  company?: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  score?: number | null;
  owner_id?: string | number | null;
  owner?: UserRecord | null;
  converted_customer_id?: string | number | null;
  converted_contact_id?: string | number | null;
  converted_deal_id?: string | number | null;
  converted_at?: string | null;
  conversion_key?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductRecord = AuditableRecord & {
  id: string | number;
  sku?: string;
  name?: string;
  category?: string | null;
  unit_price?: number | null;
  active?: boolean | null;
};

export type QuoteItemRecord = AuditableRecord & {
  id: string | number;
  quote_id?: string | number | null;
  product_id?: string | number | null;
  product_name?: string;
  qty?: number | null;
  unit_price?: number | null;
  product?: ProductRecord | null;
  quote?: QuoteRecord | null;
};

export type QuoteRecord = AuditableRecord & {
  id: string | number;
  quote_number?: string;
  version?: number | null;
  root_quote_id?: string | number | null;
  is_current?: boolean | null;
  revision_note?: string | null;
  deal_id?: string | number | null;
  customer_id?: string | number | null;
  status?: string | null;
  issue_date?: string | null;
  valid_until?: string | null;
  total?: number | null;
  deal?: DealRecord | null;
  customer?: CustomerRecord | null;
  items?: QuoteItemRecord[];
  createdAt?: string;
};

export type TargetRecord = AuditableRecord & {
  id: string | number;
  owner_id?: string | number | null;
  period?: string | null;
  quota_amount?: number | null;
  owner?: UserRecord | null;
};
