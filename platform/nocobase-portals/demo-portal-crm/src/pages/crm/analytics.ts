import { useQuery } from "@tanstack/react-query";
import { nocobaseClient } from "@nocobase/portal-sdk/client";

export type AggregateRow = Record<string, string | number | null>;

const sumAmount = { field: ["amount"], aggregation: "sum", alias: "amount" };
const countId = { field: ["id"], aggregation: "count", alias: "count" };

/**
 * Won revenue per owner inside a closed-date window. Targets compare it against
 * quota for a month or a whole quarter, so the window is passed in rather than
 * derived from a single month.
 */
export function useWonByOwner(start: string, endIso: string) {
  return useQuery({
    enabled: Boolean(start && endIso),
    queryKey: ["crm", "won-by-owner", start, endIso],
    queryFn: () => nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
      body: {
        measures: [
          { field: ["amount"], aggregation: "sum", alias: "won_amount" },
          { field: ["id"], aggregation: "count", alias: "deal_count" },
        ],
        dimensions: [
          { field: ["ownerId"], alias: "owner_id" },
          { field: ["owner", "nickname"], alias: "owner_name" },
        ],
        filter: { stage: "won", closed_date: { $between: [start, endIso] } },
      },
    }),
  });
}

/**
 * Reporting window. Won revenue is bounded by the close date; open pipeline is
 * bounded by the expected close date, which is how a forecast period is read in
 * a real sales report.
 */
export type ReportRange = { from: string; to: string };

export function useReportAnalytics(range?: ReportRange) {
  const from = range?.from ?? "";
  const to = range?.to ?? "";
  const wonFilter = (base: Record<string, unknown>) =>
    from && to ? { ...base, closed_date: { $between: [from, to] } } : base;
  const openFilter = (base: Record<string, unknown>) =>
    from && to
      ? { ...base, expected_close_date: { $between: [from, to] } }
      : base;

  return useQuery({
    queryKey: ["crm", "report-analytics", from, to],
    queryFn: async () => {
      const [
        pipeline,
        wonByDay,
        wonLoss,
        activity,
        topAccounts,
        byStage,
        leadsBySource,
      ] = await Promise.all([
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumAmount, countId],
            dimensions: [
              { field: ["stage"], alias: "stage" },
              { field: ["ownerId"], alias: "owner_id" },
              { field: ["owner", "nickname"], alias: "owner_name" },
            ],
            ...(from && to ? { filter: openFilter({}) } : {}),
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumAmount, countId],
            dimensions: [{ field: ["closed_date"], alias: "closed_date" }],
            // A date `$notNull` filter is interpreted by the server as the
            // current date in aggregate queries. Won deals already carry a
            // close date, so filtering by stage preserves the full history.
            filter: wonFilter({ stage: "won" }),
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumAmount, countId],
            dimensions: [{ field: ["stage"], alias: "stage" }],
            filter: wonFilter({ stage: { $in: ["won", "lost"] } }),
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_activities", "query", {
          body: {
            measures: [{ field: ["id"], aggregation: "count", alias: "count" }],
            dimensions: [{ field: ["type"], alias: "type" }],
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumAmount, countId],
            dimensions: [
              { field: ["customer_id"], alias: "customer_id" },
              { field: ["customer", "company_name"], alias: "customer_name" },
            ],
            orders: [{ field: ["amount"], alias: "amount", order: "desc" }],
            limit: 8,
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumAmount, countId],
            dimensions: [{ field: ["stage"], alias: "stage" }],
            ...(from && to ? { filter: openFilter({}) } : {}),
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_leads", "query", {
          body: {
            measures: [{ field: ["id"], aggregation: "count", alias: "count" }],
            dimensions: [
              { field: ["source"], alias: "source" },
              { field: ["status"], alias: "status" },
            ],
          },
        }),
      ]);
      const monthly = new Map<string, { month: string; amount: number; count: number }>();
      for (const row of wonByDay ?? []) {
        const month = String(row.closed_date ?? "").slice(0, 7);
        if (!month) continue;
        const current = monthly.get(month) ?? { month, amount: 0, count: 0 };
        current.amount += Number(row.amount ?? 0);
        current.count += Number(row.count ?? 0);
        monthly.set(month, current);
      }
      return {
        pipeline: pipeline ?? [],
        monthly: [...monthly.values()].sort((left, right) => left.month.localeCompare(right.month)),
        wonLoss: wonLoss ?? [],
        activity: activity ?? [],
        topAccounts: topAccounts ?? [],
        byStage: byStage ?? [],
        leadsBySource: leadsBySource ?? [],
      };
    },
  });
}

/** Preset reporting windows offered in the report header. */
export function rangeForPreset(preset: string): ReportRange {
  const now = new Date();
  const year = now.getFullYear();
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  switch (preset) {
    case "month":
      return {
        from: iso(new Date(year, now.getMonth(), 1)),
        to: iso(new Date(year, now.getMonth() + 1, 0)),
      };
    case "quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      return {
        from: iso(new Date(year, quarter * 3, 1)),
        to: iso(new Date(year, quarter * 3 + 3, 0)),
      };
    }
    case "year":
      return { from: iso(new Date(year, 0, 1)), to: iso(new Date(year, 11, 31)) };
    case "trailing12":
      return {
        from: iso(new Date(year - 1, now.getMonth(), 1)),
        to: iso(new Date(year, now.getMonth() + 1, 0)),
      };
    default:
      return { from: "", to: "" };
  }
}
