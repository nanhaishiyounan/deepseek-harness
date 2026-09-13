import { useList, type useTranslate } from "@refinedev/core";
import { useMemo } from "react";
import type { SlaPolicyRecord, TicketRecord } from "./types";

const SLA_POLICIES = "hub_hd_sla_policies";

/** Statuses where the SLA clock is still running. */
export const OPEN_TICKET_STATUSES = ["open", "pending"];

export type SlaState = {
  policy: SlaPolicyRecord;
  /** Deadline for resolving the ticket. */
  resolveDueAt: Date;
  /** Deadline for the first agent response. */
  responseDueAt: Date;
  /** Minutes left until the resolve deadline; negative once breached. */
  minutesLeft: number;
  isRunning: boolean;
  isBreached: boolean;
  /** 0–100 share of the resolve window consumed. */
  percentElapsed: number;
};

/**
 * SLA policies keyed by ticket priority. There are only a handful of them, so
 * one fetch covers every ticket on the page.
 */
export function useSlaByPriority() {
  const { result, query } = useList<SlaPolicyRecord>({
    resource: SLA_POLICIES,
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const byPriority = useMemo(() => {
    const map = new Map<string, SlaPolicyRecord>();
    for (const policy of result.data ?? []) {
      if (policy.priority) map.set(policy.priority, policy);
    }
    return map;
  }, [result.data]);

  return {
    byPriority,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * SLA position for one ticket.
 *
 * The clock starts at `createdAt`. For a ticket that is already resolved or
 * closed there is no resolution timestamp in the schema, so `updatedAt` stands
 * in as the moment work stopped — good enough to say whether the target was
 * met, and clearly labelled as "closed" rather than counted down.
 */
export function slaStateFor(
  ticket: TicketRecord,
  byPriority: Map<string, SlaPolicyRecord>,
  now = Date.now()
): SlaState | null {
  const policy = byPriority.get(ticket.priority ?? "");
  if (!policy || !ticket.createdAt) return null;

  const opened = new Date(ticket.createdAt).getTime();
  if (Number.isNaN(opened)) return null;

  const resolveMins = Number(policy.resolve_mins ?? 0);
  const responseMins = Number(policy.response_mins ?? 0);
  const resolveDueAt = new Date(opened + resolveMins * 60000);
  const responseDueAt = new Date(opened + responseMins * 60000);

  const isRunning = OPEN_TICKET_STATUSES.includes(ticket.status ?? "");
  const stoppedAt = ticket.updatedAt ? new Date(ticket.updatedAt).getTime() : now;
  const reference = isRunning ? now : stoppedAt;

  const minutesLeft = Math.round((resolveDueAt.getTime() - reference) / 60000);
  const elapsed = resolveMins > 0 ? ((reference - opened) / 60000 / resolveMins) * 100 : 0;

  return {
    policy,
    resolveDueAt,
    responseDueAt,
    minutesLeft,
    isRunning,
    isBreached: minutesLeft < 0,
    percentElapsed: Math.max(0, Math.min(100, elapsed)),
  };
}

/** "2d 4h" / "38m" / "-1d 6h" style countdown from a signed minute count. */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const total = Math.abs(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${mins}m`;
  return `${sign}${mins}m`;
}

/** Traffic-light band for the remaining SLA window. */
export function slaTone(state: SlaState): "breached" | "risk" | "ok" {
  if (state.isBreached) return "breached";
  if (state.percentElapsed >= 70) return "risk";
  return "ok";
}

export function slaLabel(
  state: SlaState,
  translate: ReturnType<typeof useTranslate>
): string {
  if (!state.isRunning) {
    return state.isBreached
      ? translate("helpdesk.sla.closedBreached", { ns: "starter" }, "Closed late")
      : translate("helpdesk.sla.closedMet", { ns: "starter" }, "Met");
  }
  if (state.isBreached) {
    return translate("helpdesk.sla.breachedBy", { ns: "starter" }, "Breached {{time}}").replace(
      "{{time}}",
      formatDuration(Math.abs(state.minutesLeft))
    );
  }
  return translate("helpdesk.sla.dueIn", { ns: "starter" }, "{{time}} left").replace(
    "{{time}}",
    formatDuration(state.minutesLeft)
  );
}

/** Age in hours since the ticket was opened — the backlog-ageing dimension. */
export function ticketAgeHours(ticket: TicketRecord, now = Date.now()): number {
  if (!ticket.createdAt) return 0;
  const opened = new Date(ticket.createdAt).getTime();
  if (Number.isNaN(opened)) return 0;
  return Math.max(0, (now - opened) / 3600000);
}

export const AGE_BUCKETS = [
  { id: "d0", i18nKey: "helpdesk.aging.bucket.d0", label: "< 1 day", max: 24 },
  { id: "d1", i18nKey: "helpdesk.aging.bucket.d1", label: "1–3 days", max: 72 },
  { id: "d3", i18nKey: "helpdesk.aging.bucket.d3", label: "3–7 days", max: 168 },
  { id: "d7", i18nKey: "helpdesk.aging.bucket.d7", label: "1–2 weeks", max: 336 },
  { id: "d14", i18nKey: "helpdesk.aging.bucket.d14", label: "2+ weeks", max: Infinity },
] as const;

export function ageBucketFor(hours: number): string {
  for (const bucket of AGE_BUCKETS) {
    if (hours < bucket.max) return bucket.id;
  }
  return AGE_BUCKETS[AGE_BUCKETS.length - 1].id;
}
