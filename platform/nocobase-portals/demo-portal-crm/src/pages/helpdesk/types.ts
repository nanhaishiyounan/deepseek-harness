import type { BaseRecord } from "@refinedev/core";

export type UserRef = {
  id: number | string;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
};

export type ReplyRecord = BaseRecord & {
  id: number | string;
  body?: string | null;
  ticketId?: number | string | null;
  authorId?: number | string | null;
  author?: UserRef | null;
  createdAt?: string | null;
};

export type ReplyFormValues = {
  body: string;
  ticketId: number | string | null;
};

export type TicketRecord = BaseRecord & {
  id: number | string;
  subject?: string | null;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  requesterId?: number | string | null;
  assigneeId?: number | string | null;
  requester?: UserRef | null;
  assignee?: UserRef | null;
  replies?: ReplyRecord[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TicketFormValues = {
  subject: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  requesterId: number | string | null;
  assigneeId: number | string | null;
};

export type SlaPolicyRecord = BaseRecord & {
  id: number | string;
  name?: string | null;
  priority?: string | null;
  response_mins?: number | null;
  resolve_mins?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FaqRecord = BaseRecord & {
  id: number | string;
  question?: string | null;
  answer?: string | null;
  category?: string | null;
};

export type FaqFormValues = {
  question: string;
  answer: string;
  category: string | null;
};

export type SlaPolicyFormValues = {
  name: string;
  priority: string;
  response_mins: number;
  resolve_mins: number;
};
