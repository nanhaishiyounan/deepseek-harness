import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

type AggregateRow = Record<string, string | number | null>;

export type SupplierStats = {
  orders: number;
  spend: number;
  openSpend: number;
  receivedSpend: number;
  cancelled: number;
  received: number;
};

/**
 * Purchase-order totals per supplier, grouped by status on the server.
 * Counting `po_number` is intentional: integer primary-key counts are not
 * returned by the query endpoint for this collection.
 */
export function useSupplierOrderStats() {
  const query = useQuery({
    queryKey: ["procurement", "supplier-order-stats"],
    queryFn: () =>
      nocobaseClient.action<AggregateRow[]>("hub_po_purchase_orders", "query", {
        body: {
          measures: [
            { field: ["total"], aggregation: "sum", alias: "totalSum" },
            { field: ["po_number"], aggregation: "count", alias: "orders" },
          ],
          dimensions: [
            { field: ["supplier_id"], alias: "supplierId" },
            { field: ["status"], alias: "status" },
          ],
        },
      }),
  });

  const statsBySupplier = useMemo(() => {
    const map = new Map<string, SupplierStats>();
    for (const row of query.data ?? []) {
      if (row.supplierId == null) continue;
      const key = String(row.supplierId);
      const status = String(row.status ?? "");
      const orders = Number(row.orders ?? 0);
      const total = Number(row.totalSum ?? 0);
      const stats = map.get(key) ?? {
        orders: 0,
        spend: 0,
        openSpend: 0,
        receivedSpend: 0,
        cancelled: 0,
        received: 0,
      };

      stats.orders += orders;
      if (status !== "cancelled") stats.spend += total;
      if (status === "draft" || status === "sent") stats.openSpend += total;
      if (status === "received") {
        stats.receivedSpend += total;
        stats.received += orders;
      }
      if (status === "cancelled") stats.cancelled += orders;
      map.set(key, stats);
    }
    return map;
  }, [query.data]);

  return {
    statsBySupplier,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
