import { useList, useTranslate } from "@refinedev/core";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { FollowUpRecord, LeadRecord } from "./types";

const BADGED_ITEMS = ["crm_follow_ups", "crm_leads"];

/**
 * Whether a menu row carries a badge at all. `SidebarButton` switches its label
 * classes on the truthiness of `rightIcon`, so the sidebar has to know before it
 * renders — handing it an element that only renders null at runtime would still
 * change the layout of every row.
 */
export const hasCrmMenuBadge = (itemName?: string) =>
  Boolean(itemName && BADGED_ITEMS.includes(itemName));

export function CrmMenuBadge({
  itemName,
}: {
  itemName?: string;
}): ReactNode {
  const translate = useTranslate();
  const isFollowUps = itemName === "crm_follow_ups";
  const isLeads = itemName === "crm_leads";
  const today = new Date().toISOString().slice(0, 10);

  // Each sidebar row owns both hooks, but only its matching count request runs.
  const followUps = useList<FollowUpRecord>({
    resource: "crm_follow_ups",
    filters: [
      // Counts both the stored `overdue` status and anything still open past
      // its due date, so the badge never under-reports the queue.
      { field: "status", operator: "ne", value: "done" },
      { field: "due_date", operator: "lt", value: today },
    ],
    pagination: { mode: "server", currentPage: 1, pageSize: 1 },
    meta: { fields: ["id"] },
    errorNotification: false,
    queryOptions: { enabled: isFollowUps, retry: false, staleTime: 60_000 },
  });
  const leads = useList<LeadRecord>({
    resource: "crm_leads",
    filters: [{ field: "status", operator: "eq", value: "new" }],
    pagination: { mode: "server", currentPage: 1, pageSize: 1 },
    meta: { fields: ["id"] },
    errorNotification: false,
    queryOptions: { enabled: isLeads, retry: false, staleTime: 60_000 },
  });

  if (isFollowUps) {
    const count = followUps.result.total ?? 0;
    if (followUps.query.isLoading || count === 0) return null;
    const label = translate(
      "crm.badges.overdue",
      { ns: "starter" },
      "overdue follow-ups"
    );
    return (
      <Badge variant="destructive" aria-label={`${count} ${label}`}>
        {count}
      </Badge>
    );
  }

  if (isLeads) {
    const count = leads.result.total ?? 0;
    if (leads.query.isLoading || count === 0) return null;
    const label = translate(
      "crm.badges.newLeads",
      { ns: "starter" },
      "new leads"
    );
    return (
      <Badge variant="secondary" aria-label={`${count} ${label}`}>
        {count}
      </Badge>
    );
  }

  return null;
}
