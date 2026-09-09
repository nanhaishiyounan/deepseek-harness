// Minimal shapes for the cross-module records the Overview reads. Each module
// owns its own richer types; Overview deliberately keeps a local, narrow copy so
// a change inside a module cannot break the landing page.

export type UserRef = {
  id: string | number;
  nickname?: string | null;
  username?: string | null;
};

export type DealLite = {
  id: string | number;
  title?: string;
  stage?: string | null;
  amount?: number | null;
  expected_close_date?: string | null;
  account?: { id: string | number; name?: string } | null;
  updatedAt?: string;
};

export type TaskLite = {
  id: string | number;
  title?: string;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  project?: { id: string | number; name?: string } | null;
  assignee?: UserRef | null;
};

export type TicketLite = {
  id: string | number;
  subject?: string;
  status?: string | null;
  priority?: string | null;
  category?: string | null;
  createdAt?: string;
  assignee?: UserRef | null;
  requester?: UserRef | null;
};

export type InvoiceLite = {
  id: string | number;
  invoice_number?: string;
  client_name?: string;
  amount?: number | null;
  issue_date?: string | null;
  due_date?: string | null;
  status?: string | null;
};

export type LeaveLite = {
  id: string | number;
  type?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  days?: number | null;
  createdAt?: string;
  employee?: { id: string | number; name?: string } | null;
};

export type ProjectLite = {
  id: string | number;
  name?: string;
  status?: string | null;
  due_date?: string | null;
};

export type ActivityLite = {
  id: string | number;
  type?: string | null;
  subject?: string;
  date?: string | null;
  deal?: { id: string | number; title?: string } | null;
};

export type ArticleLite = {
  id: string | number;
  title?: string;
  summary?: string | null;
  status?: string | null;
  views?: number | null;
  createdAt?: string;
  author?: UserRef | null;
};
