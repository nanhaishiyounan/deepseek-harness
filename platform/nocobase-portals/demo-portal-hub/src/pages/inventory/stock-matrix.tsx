import { useList, useTranslate } from "@refinedev/core";
import { Boxes, PackageSearch, TriangleAlert, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useOnHandMatrix } from "./aggregates";
import {
  CATEGORIES,
  formatCurrency,
  formatNumber,
  labelFor,
} from "./constants";
import { AsyncPanel, KpiStrip, exportCsv, type KpiTile } from "@/lib/table-kit";
import { inventoryRoutes } from "./routes";
import { EnumBadge, useLocale } from "./shared";
import type { ProductRecord, WarehouseRecord } from "./types";

/**
 * Product × warehouse on-hand matrix — the "where is my stock" screen. Totals
 * are summed server-side, so the page only fetches the catalog and the
 * warehouse list.
 */
export function StockMatrix() {
  const translate = useTranslate();
  const locale = useLocale();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const products = useList<ProductRecord>({
    resource: "hub_inv_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const warehouses = useList<WarehouseRecord>({
    resource: "hub_inv_warehouses",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const matrix = useOnHandMatrix();

  const rows = useMemo(() => {
    const warehouseList = warehouses.result.data;
    const term = search.trim().toLowerCase();

    return products.result.data
      .map((product) => {
        const perWarehouse = warehouseList.map((warehouse) => ({
          warehouseId: String(warehouse.id),
          qty: matrix.cells.get(`${product.id}::${warehouse.id}`) ?? 0,
        }));
        const total = perWarehouse.reduce((sum, cell) => sum + cell.qty, 0);
        const reorder = Number(product.reorder_level ?? 0);
        return {
          product,
          perWarehouse,
          total,
          reorder,
          isLow: total <= reorder,
          stockValue: total * Number(product.unit_price ?? 0),
        };
      })
      .filter((row) => {
        if (lowOnly && !row.isLow) return false;
        if (!term) return true;
        return (
          (row.product.name ?? "").toLowerCase().includes(term) ||
          (row.product.sku ?? "").toLowerCase().includes(term)
        );
      });
  }, [lowOnly, matrix.cells, products.result.data, search, warehouses.result.data]);

  const warehouseTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      for (const cell of row.perWarehouse) {
        totals.set(cell.warehouseId, (totals.get(cell.warehouseId) ?? 0) + cell.qty);
      }
    }
    return totals;
  }, [rows]);

  const tiles = useMemo<KpiTile[]>(() => {
    const totalUnits = rows.reduce((sum, row) => sum + row.total, 0);
    const totalValue = rows.reduce((sum, row) => sum + row.stockValue, 0);
    const lowCount = rows.filter((row) => row.isLow).length;
    const emptyLocations = warehouses.result.data.filter(
      (warehouse) => (warehouseTotals.get(String(warehouse.id)) ?? 0) === 0
    ).length;

    return [
      {
        key: "units",
        label: translate("inventory.matrix.kpi.units", { ns: "starter" }, "Units on hand"),
        value: formatNumber(totalUnits, locale),
        hint: translate(
          "inventory.matrix.kpi.units.hint",
          { ns: "starter" },
          "Across {{count}} locations"
        ).replace("{{count}}", String(warehouses.result.data.length)),
        icon: Boxes,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "value",
        label: translate("inventory.matrix.kpi.value", { ns: "starter" }, "Stock value"),
        value: formatCurrency(totalValue, locale),
        hint: translate(
          "inventory.matrix.kpi.value.hint",
          { ns: "starter" },
          "On-hand units at unit price"
        ),
        icon: PackageSearch,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "low",
        label: translate("inventory.matrix.kpi.low", { ns: "starter" }, "At or below reorder"),
        value: String(lowCount),
        hint: translate(
          "inventory.matrix.kpi.low.hint",
          { ns: "starter" },
          "Click to filter the matrix"
        ),
        icon: TriangleAlert,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => setLowOnly((previous) => !previous),
        active: lowOnly,
      },
      {
        key: "empty",
        label: translate("inventory.matrix.kpi.emptyLocations", { ns: "starter" }, "Empty locations"),
        value: String(emptyLocations),
        hint: translate(
          "inventory.matrix.kpi.emptyLocations.hint",
          { ns: "starter" },
          "Warehouses holding nothing"
        ),
        icon: Warehouse,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
    ];
  }, [locale, lowOnly, rows, translate, warehouseTotals, warehouses.result.data]);

  const isLoading =
    products.query.isLoading || warehouses.query.isLoading || matrix.isLoading;
  const isError = products.query.isError || warehouses.query.isError || matrix.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("inventory.matrix.title", { ns: "starter" }, "Stock by warehouse")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "inventory.matrix.description",
                { ns: "starter" },
                "On-hand quantity for every product in every location, with reorder exposure."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              placeholder={translate(
                "inventory.matrix.searchPlaceholder",
                { ns: "starter" },
                "Search SKU or name"
              )}
              className="h-9 w-56"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant={lowOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setLowOnly((previous) => !previous)}
            >
              {translate("inventory.matrix.lowOnly", { ns: "starter" }, "Low stock only")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  "stock-by-warehouse",
                  [
                    { header: "SKU", value: (row: (typeof rows)[number]) => row.product.sku },
                    { header: "Product", value: (row) => row.product.name },
                    {
                      header: "Category",
                      value: (row) => labelFor(CATEGORIES, row.product.category),
                    },
                    ...warehouses.result.data.map((warehouse) => ({
                      header: warehouse.name ?? String(warehouse.id),
                      value: (row: (typeof rows)[number]) =>
                        row.perWarehouse.find(
                          (cell) => cell.warehouseId === String(warehouse.id)
                        )?.qty ?? 0,
                    })),
                    { header: "Total on hand", value: (row) => row.total },
                    { header: "Reorder level", value: (row) => row.reorder },
                    { header: "Stock value", value: (row) => Math.round(row.stockValue) },
                  ],
                  rows
                )
              }
            >
              {translate("inventory.ops.exportCsv", { ns: "starter" }, "Export CSV")}
            </Button>
          </div>
        </div>
      </div>

      <AsyncPanel i18nPrefix="inventory.ops"
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && rows.length === 0}
        onRetry={() => {
          void products.query.refetch();
          void warehouses.query.refetch();
          void matrix.refetch();
        }}
        emptyTitle={translate(
          "inventory.matrix.empty.title",
          { ns: "starter" },
          "No products match"
        )}
        emptyDescription={translate(
          "inventory.matrix.empty.description",
          { ns: "starter" },
          "Clear the search or the low-stock filter to see the full matrix."
        )}
        skeletonRows={8}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <Card>
            <CardHeader>
              <CardTitle>
                {translate("inventory.matrix.table.title", { ns: "starter" }, "On-hand matrix")}
              </CardTitle>
              <CardDescription>
                {translate(
                  "inventory.matrix.table.description",
                  { ns: "starter" },
                  "Rows below their reorder level are highlighted. Click a row to open the product."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 font-medium">
                        {translate("inventory.reorder.list.product", { ns: "starter" }, "Product")}
                      </th>
                      <th className="px-3 py-2 font-medium">
                        {translate("inventory.reorder.list.category", { ns: "starter" }, "Category")}
                      </th>
                      {warehouses.result.data.map((warehouse) => (
                        <th
                          key={String(warehouse.id)}
                          className="px-3 py-2 text-right font-medium whitespace-nowrap"
                        >
                          {warehouse.code || warehouse.name}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium">
                        {translate("inventory.matrix.headers.total", { ns: "starter" }, "Total")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate("inventory.reorder.list.reorderLevel", { ns: "starter" }, "Reorder level")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate("inventory.matrix.headers.value", { ns: "starter" }, "Value")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr
                        key={String(row.product.id)}
                        className={cn(
                          "cursor-pointer hover:bg-accent",
                          row.isLow && "bg-destructive/5"
                        )}
                        onClick={() =>
                          navigate(`${inventoryRoutes.products}/show/${row.product.id}`)
                        }
                      >
                        <td className="sticky left-0 z-10 bg-card px-3 py-2">
                          <p className="font-medium">{row.product.name || "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.product.sku || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <EnumBadge
                            value={row.product.category}
                            label={labelFor(CATEGORIES, row.product.category, translate)}
                          />
                        </td>
                        {row.perWarehouse.map((cell) => (
                          <td
                            key={cell.warehouseId}
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              cell.qty === 0 && "text-muted-foreground/50"
                            )}
                          >
                            {formatNumber(cell.qty, locale)}
                          </td>
                        ))}
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-medium tabular-nums",
                            row.isLow && "text-destructive"
                          )}
                        >
                          {formatNumber(row.total, locale)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatNumber(row.reorder, locale)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(row.stockValue, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 text-xs font-medium">
                      <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">
                        {translate("inventory.matrix.headers.locationTotal", { ns: "starter" }, "Location total")}
                      </td>
                      <td className="px-3 py-2" />
                      {warehouses.result.data.map((warehouse) => (
                        <td
                          key={String(warehouse.id)}
                          className="px-3 py-2 text-right tabular-nums"
                        >
                          {formatNumber(warehouseTotals.get(String(warehouse.id)) ?? 0, locale)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(
                          rows.reduce((sum, row) => sum + row.total, 0),
                          locale
                        )}
                      </td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(
                          rows.reduce((sum, row) => sum + row.stockValue, 0),
                          locale
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </AsyncPanel>
    </div>
  );
}
