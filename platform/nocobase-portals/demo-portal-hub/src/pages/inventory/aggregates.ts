import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

type AggregateRow = Record<string, string | number | null>;

/** Stock-move columns the on-hand totals can be grouped by. */
export type StockDimension = "product_id" | "warehouse_id";

/**
 * On-hand units per product or per warehouse, summed on the server.
 *
 * The signed total is `sum(qty)` grouped by the dimension and the move type,
 * with outbound moves subtracted. Grouping by type as well keeps the sign
 * rule (see `signedQty`) in one place while still letting the database do the
 * summing: the response is a couple of rows per key rather than every stock
 * move in the collection.
 */
export function useOnHandBy(dimension: StockDimension) {
  const query = useQuery({
    queryKey: ["inventory", "on-hand", dimension],
    queryFn: () =>
      nocobaseClient.action<AggregateRow[]>("hub_inv_stock_moves", "query", {
        body: {
          measures: [{ field: ["qty"], aggregation: "sum", alias: "qty" }],
          dimensions: [
            { field: [dimension], alias: "key" },
            { field: ["type"], alias: "type" },
          ],
        },
      }),
  });

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      if (row.key === null || row.key === undefined) continue;
      const key = String(row.key);
      const qty = Number(row.qty ?? 0);
      const signed = row.type === "out" ? -qty : qty;
      map.set(key, (map.get(key) ?? 0) + signed);
    }
    return map;
  }, [query.data]);

  return {
    totals,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Totals for the inventory dashboard: how many moves exist, and how many units
 * moved in each direction. Aggregated server-side so the dashboard never pulls
 * the stock-move history just to count it.
 */
export function useStockMoveTotals() {
  const query = useQuery({
    queryKey: ["inventory", "move-totals"],
    queryFn: () =>
      nocobaseClient.action<AggregateRow[]>("hub_inv_stock_moves", "query", {
        body: {
          measures: [
            { field: ["qty"], aggregation: "sum", alias: "qty" },
            { field: ["id"], aggregation: "count", alias: "moves" },
          ],
          dimensions: [{ field: ["type"], alias: "type" }],
        },
      }),
  });

  return useMemo(() => {
    const unitsByType = new Map<string, number>();
    let moveCount = 0;
    for (const row of query.data ?? []) {
      unitsByType.set(String(row.type ?? ""), Number(row.qty ?? 0));
      moveCount += Number(row.moves ?? 0);
    }
    return {
      unitsByType,
      moveCount,
      isLoading: query.isLoading,
    };
  }, [query.data, query.isLoading]);
}

/**
 * On-hand units per product *per warehouse* — the multi-location stock matrix
 * every WMS-style inventory module leads with. Same server-side sum as
 * `useOnHandBy`, with both keys in the grouping so no stock move is fetched.
 */
export function useOnHandMatrix() {
  const query = useQuery({
    queryKey: ["inventory", "on-hand-matrix"],
    queryFn: () =>
      nocobaseClient.action<AggregateRow[]>("hub_inv_stock_moves", "query", {
        body: {
          measures: [{ field: ["qty"], aggregation: "sum", alias: "qty" }],
          dimensions: [
            { field: ["product_id"], alias: "productId" },
            { field: ["warehouse_id"], alias: "warehouseId" },
            { field: ["type"], alias: "type" },
          ],
        },
      }),
  });

  const cells = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      if (row.productId == null || row.warehouseId == null) continue;
      const key = `${row.productId}::${row.warehouseId}`;
      const qty = Number(row.qty ?? 0);
      map.set(key, (map.get(key) ?? 0) + (row.type === "out" ? -qty : qty));
    }
    return map;
  }, [query.data]);

  return {
    cells,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Units shipped out per product since `sinceIso` — the demand signal behind
 * turnover and dead-stock analysis. Filtered and summed on the server.
 */
export function useOutboundSince(sinceIso: string) {
  const query = useQuery({
    queryKey: ["inventory", "outbound-since", sinceIso],
    queryFn: () =>
      nocobaseClient.action<AggregateRow[]>("hub_inv_stock_moves", "query", {
        body: {
          measures: [{ field: ["qty"], aggregation: "sum", alias: "qty" }],
          dimensions: [{ field: ["product_id"], alias: "productId" }],
          filter: {
            $and: [
              { type: { $eq: "out" } },
              { moved_at: { $dateAfter: sinceIso } },
            ],
          },
        },
      }),
  });

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      if (row.productId == null) continue;
      map.set(String(row.productId), Number(row.qty ?? 0));
    }
    return map;
  }, [query.data]);

  return {
    totals,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
