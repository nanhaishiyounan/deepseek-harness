export type UserRef = {
  id: number;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
};

export type Expense = {
  id: number;
  title: string;
  category: string;
  amount: number;
  spent_at: string | null;
  status: string;
  employee_id?: number | null;
  employee?: UserRef | null;
  createdAt?: string;
};

export type Invoice = {
  id: number;
  invoice_number: string;
  client_name: string;
  amount: number;
  issue_date: string | null;
  due_date: string | null;
  status: string;
  createdAt?: string;
};

export type ExpenseFormValues = {
  title: string;
  category: string;
  amount: number | string;
  spent_at: string;
  status: string;
  employee_id: number | string | null;
};

export type InvoiceFormValues = {
  invoice_number: string;
  client_name: string;
  amount: number | string;
  issue_date: string;
  due_date: string;
  status: string;
};

export type InvoiceLineItem = {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type InvoiceItemFormValues = {
  description: string;
  quantity: number | string;
  unit_price: number | string;
  invoice_id: number | string | null;
};

export type Budget = {
  id: number;
  category: string;
  period: string | null;
  amount: number;
};
