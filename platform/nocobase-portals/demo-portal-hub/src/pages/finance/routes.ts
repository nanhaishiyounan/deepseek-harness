// Path constants for the Finance module. The primary list is mounted at
// /invoices (the Home quick-link target); expenses and the dashboard sit
// alongside it in the same nav group.
export const financeRoutes = {
  dashboard: "/finance",
  reports: "/finance/reports",
  cashFlow: "/cash-flow",
  budget: "/budget",
  // Accounts-receivable ageing + collections worklist
  aging: "/ar-aging",
  invoices: "/invoices",
  invoiceCreate: "/invoices/create",
  invoiceEdit: "/invoices/edit/:id",
  invoiceShow: "/invoices/show/:id",
  expenses: "/expenses",
  expenseCreate: "/expenses/create",
  expenseEdit: "/expenses/edit/:id",
  expenseShow: "/expenses/show/:id",
} as const;

export const invoiceEditPath = (id: string | number) =>
  `/invoices/edit/${encodeURIComponent(id)}`;

export const expenseEditPath = (id: string | number) =>
  `/expenses/edit/${encodeURIComponent(id)}`;
