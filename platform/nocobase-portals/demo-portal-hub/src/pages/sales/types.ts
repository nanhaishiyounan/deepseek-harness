export type UserRef = {
  id: string | number;
  nickname?: string | null;
  username?: string | null;
};

export type AccountRecord = {
  id: string | number;
  name?: string;
  industry?: string | null;
  website?: string | null;
  owner_id?: string | number | null;
  owner?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AccountFormValues = {
  name: string;
  industry: string | null;
  website: string;
  owner_id: string | null;
};

export type ContactRecord = {
  id: string | number;
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  account_id?: string | number | null;
  account?: AccountRecord | null;
  createdAt?: string;
};

export type ContactFormValues = {
  name: string;
  title: string;
  email: string;
  phone: string;
  account_id: string | null;
};

export type DealRecord = {
  id: string | number;
  title?: string;
  stage?: string | null;
  amount?: number | null;
  expected_close_date?: string | null;
  account_id?: string | number | null;
  account?: AccountRecord | null;
  owner_id?: string | number | null;
  owner?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DealFormValues = {
  title: string;
  stage: string;
  amount: number | null;
  expected_close_date: string | null;
  account_id: string | null;
  owner_id: string | null;
};

export type LeadRecord = {
  id: string | number;
  name?: string;
  company?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;
  owner_id?: string | number | null;
  owner?: UserRef | null;
  converted_at?: string | null;
  converted_account_id?: string | number | null;
  converted_contact_id?: string | number | null;
  converted_deal_id?: string | number | null;
  conversion_key?: string | null;
  createdAt?: string;
};

export type LeadFormValues = {
  name: string;
  company: string;
  email: string;
  source: string | null;
  status: string;
  owner_id: string | null;
};

export type ActivityRecord = {
  id: string | number;
  type?: string | null;
  subject?: string;
  notes?: string | null;
  date?: string | null;
  deal_id?: string | number | null;
  deal?: DealRecord | null;
  createdAt?: string;
};

export type ActivityFormValues = {
  type: string;
  subject: string;
  notes: string;
  date: string | null;
  deal_id: string | null;
};
