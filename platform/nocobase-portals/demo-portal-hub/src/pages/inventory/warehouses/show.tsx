import { useList, useShow, useTranslate } from "@refinedev/core";
import { Eye, Pencil } from "lucide-react";
import { useMemo } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  MOVE_TYPES,
  formatDateTime,
  labelFor,
  signedQty,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type { StockMoveRecord, WarehouseRecord } from "../types";

export function WarehouseShow({
  idParam = "id",
}: {
  idParam?: string;
} = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nestedOutlet = useOutlet();
  const { result: record, query } = useShow<WarehouseRecord>({
    resource: "hub_inv_warehouses",
    id,
  });

  const displayName =
    record?.name ||
    translate("inventory.warehouses.detail.unnamed", { ns: "starter" }, "Unnamed warehouse");

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? <Skeleton className="h-6 w-40" /> : displayName
      }
      description={translate(
        "inventory.warehouses.drawer.show.description",
        { ns: "starter" },
        "Stock held and recent movements for this location."
      )}
      closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nestedOutlet}
      actions={
        record ? (
          <EditButton
            resource="hub_inv_warehouses"
            recordItemId={record.id}
            variant="outline"
            size="icon-sm"
            aria-label={translate("inventory.warehouses.actions.edit", { ns: "starter" }, "Edit warehouse")}
            onClick={() => openChild("edit")}
          >
            <Pencil />
          </EditButton>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate(
                "inventory.warehouses.detail.loadError.title",
                { ns: "starter" },
                "Unable to load warehouse"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "inventory.warehouses.detail.loadError.description",
                { ns: "starter" },
                "The warehouse may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("inventory.warehouses.detail.profile", { ns: "starter" }, "Profile")}
              items={[
                [
                  translate("inventory.warehouses.fields.code", { ns: "starter" }, "Code"),
                  record?.code || "—",
                ],
                [
                  translate("inventory.warehouses.fields.location", { ns: "starter" }, "Location"),
                  record?.location || "—",
                ],
              ]}
            />
            {id ? (
              <>
                <Separator />
                <WarehouseStock warehouseId={id} openChild={openChild} locale={locale} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

type OpenChild = (to: string) => void;

function WarehouseStock({
  warehouseId,
  openChild,
  locale,
}: {
  warehouseId: string;
  openChild: OpenChild;
  locale: string;
}) {
  const translate = useTranslate();
  const { result } = useList<StockMoveRecord>({
    resource: "hub_inv_stock_moves",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "moved_at", order: "desc" }],
    filters: [{ field: "warehouse_id", operator: "eq", value: warehouseId }],
    meta: { appends: ["product"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  // On-hand per product held at this warehouse, derived from its stock moves.
  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; qty: number }>();
    for (const move of result.data) {
      if (move.product_id === null || move.product_id === undefined) continue;
      const key = String(move.product_id);
      const existing = map.get(key);
      const qty = signedQty(move.type, move.qty);
      if (existing) {
        existing.qty += qty;
      } else {
        map.set(key, {
          id: key,
          name: move.product?.name || "—",
          qty,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [result.data]);

  const recentMoves = useMemo(() => result.data.slice(0, 10), [result.data]);

  return (
    <div className="space-y-6">
      <DrawerSection
        title={translate(
          "inventory.warehouses.detail.products",
          { ns: "starter", count: products.length },
          `Products stored · ${products.length}`
        )}
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{translate("inventory.stockMoves.fields.product", { ns: "starter" }, "Product")}</th>
                <th className="px-3 py-2 font-medium">{translate("inventory.products.fields.onHand", { ns: "starter" }, "On hand")}</th>
                <th className="px-3 py-2 font-medium">{translate("inventory.common.actions", { ns: "starter" }, "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    {translate("inventory.warehouses.detail.noProducts", { ns: "starter" }, "No products stored here yet.")}
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-3 py-2 font-medium">{product.name}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">{product.qty}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={translate("inventory.warehouses.detail.viewProduct", { ns: "starter" }, "View product")}
                        onClick={() =>
                          openChild(`products/show/${encodeURIComponent(product.id)}`)
                        }
                      >
                        <Eye />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DrawerSection>

      <DrawerSection
        title={translate("inventory.warehouses.detail.recentMoves", { ns: "starter" }, "Recent stock moves")}
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{translate("inventory.stockMoves.fields.date", { ns: "starter" }, "Date")}</th>
                <th className="px-3 py-2 font-medium">{translate("inventory.stockMoves.fields.product", { ns: "starter" }, "Product")}</th>
                <th className="px-3 py-2 font-medium">{translate("inventory.stockMoves.fields.type", { ns: "starter" }, "Type")}</th>
                <th className="px-3 py-2 font-medium">{translate("inventory.stockMoves.fields.qty", { ns: "starter" }, "Qty")}</th>
                <th className="px-3 py-2 font-medium">{translate("inventory.common.actions", { ns: "starter" }, "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentMoves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    {translate("inventory.warehouses.detail.noMoves", { ns: "starter" }, "No stock moves recorded here yet.")}
                  </td>
                </tr>
              ) : (
                recentMoves.map((move) => (
                  <tr key={String(move.id)}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateTime(move.moved_at, locale)}
                    </td>
                    <td className="px-3 py-2">{move.product?.name || "—"}</td>
                    <td className="px-3 py-2">
                      <EnumBadge
                        value={move.type ?? "in"}
                        label={move.type ? labelFor(MOVE_TYPES, move.type, translate) : "—"}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {signedQty(move.type, move.qty) > 0 ? "+" : ""}
                      {signedQty(move.type, move.qty)}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={translate("inventory.stockMoves.actions.view", { ns: "starter" }, "View move")}
                        onClick={() =>
                          openChild(`moves/show/${encodeURIComponent(String(move.id))}`)
                        }
                      >
                        <Eye />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DrawerSection>
    </div>
  );
}
