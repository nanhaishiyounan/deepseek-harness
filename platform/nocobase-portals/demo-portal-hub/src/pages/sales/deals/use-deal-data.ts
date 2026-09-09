import { useList } from "@refinedev/core";
import { useMemo } from "react";
import {
  OPEN_DEAL_STAGES,
  daysSince,
  todayIso,
  weightedAmount,
} from "../constants";
import type { ActivityRecord, DealRecord } from "../types";

/** A deal enriched with the derived signals a rep actually works from. */
export type EnrichedDeal = DealRecord & {
  weighted: number;
  isOpen: boolean;
  /** Days until the expected close; negative once the date has passed. */
  daysToClose: number | null;
  isOverdue: boolean;
  /** Days since the most recent logged activity; null when never touched. */
  lastTouchDays: number | null;
  lastTouchAt: string | null;
  activityCount: number;
  /** Open, and either never touched or silent for 30+ days. */
  isStale: boolean;
};

const STALE_DAYS = 30;

/**
 * Loads the whole pipeline in one pass (150-ish deals, 350-ish activities) and
 * joins them client-side. hub_sales_deals has no "last activity" column, so the
 * recency signal that drives the stale/needs-attention view is derived here.
 */
export function useDealData() {
  const dealsQuery = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["account", "owner"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const activitiesQuery = useList<ActivityRecord>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    sorters: [{ field: "date", order: "desc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const lastTouch = useMemo(() => {
    const map = new Map<string, { at: string; count: number }>();
    for (const activity of activitiesQuery.result.data) {
      if (!activity.deal_id || !activity.date) continue;
      const key = String(activity.deal_id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { at: activity.date, count: 1 });
      } else {
        existing.count += 1;
        if (activity.date > existing.at) existing.at = activity.date;
      }
    }
    return map;
  }, [activitiesQuery.result.data]);

  const deals = useMemo<EnrichedDeal[]>(() => {
    const today = todayIso();
    return dealsQuery.result.data.map((deal) => {
      const isOpen = OPEN_DEAL_STAGES.includes(deal.stage ?? "");
      const touch = lastTouch.get(String(deal.id));
      const lastTouchDays = touch ? daysSince(touch.at) : null;
      const close = deal.expected_close_date ?? null;
      const daysToClose = close
        ? Math.round(
            (new Date(close).getTime() - new Date(today).getTime()) / 86_400_000
          )
        : null;
      return {
        ...deal,
        weighted: weightedAmount(deal.amount, deal.stage),
        isOpen,
        daysToClose,
        isOverdue: isOpen && daysToClose !== null && daysToClose < 0,
        lastTouchDays,
        lastTouchAt: touch?.at ?? null,
        activityCount: touch?.count ?? 0,
        isStale:
          isOpen && (lastTouchDays === null || lastTouchDays >= STALE_DAYS),
      };
    });
  }, [dealsQuery.result.data, lastTouch]);

  return {
    deals,
    isLoading: dealsQuery.query.isLoading,
    isError: dealsQuery.query.isError,
    isFetching: dealsQuery.query.isFetching || activitiesQuery.query.isFetching,
    refetch: () => {
      void dealsQuery.query.refetch();
      void activitiesQuery.query.refetch();
    },
  };
}

export const STALE_THRESHOLD_DAYS = STALE_DAYS;
