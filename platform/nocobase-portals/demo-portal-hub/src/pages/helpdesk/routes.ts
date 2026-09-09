export const helpdeskRoutes = {
  tickets: "/tickets",
  ticketsCreate: "/tickets/create",
  ticketsEdit: "/tickets/edit/:id",
  ticketsShow: "/tickets/show/:id",
  ticketsShowStatus: "/tickets/show/:id/status",
  ticketsShowReplyEdit: "/tickets/show/:id/replies/edit/:replyId",
  dashboard: "/helpdesk/dashboard",
  agentPerformance: "/helpdesk/agents",
  slaPolicies: "/sla-policies",
  slaPoliciesCreate: "/sla-policies/create",
  slaPoliciesShow: "/sla-policies/show/:id",
  faq: "/faq",
  faqCreate: "/faq/create",
  faqEdit: "/faq/edit/:id",
} as const;

export const getTicketShowPath = (id: string | number) =>
  `/tickets/show/${encodeURIComponent(id)}`;

export const getTicketEditPath = (id: string | number) =>
  `/tickets/edit/${encodeURIComponent(id)}`;

export const getTicketStatusPath = (id: string | number) =>
  `/tickets/show/${encodeURIComponent(id)}/status`;

export const getSlaPolicyShowPath = (id: string | number) =>
  `/sla-policies/show/${encodeURIComponent(id)}`;

export const getFaqEditPath = (id: string | number) =>
  `/faq/edit/${encodeURIComponent(id)}`;
