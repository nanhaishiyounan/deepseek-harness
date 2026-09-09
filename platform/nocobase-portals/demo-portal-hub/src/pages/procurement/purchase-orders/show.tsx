import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import {
  AlertTriangle,
  Check,
  Link2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useMemo } from "react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  PO_STATUSES,
  PO_TRANSITIONS,
  PO_TRANSITION_LABELS,
  PO_WORKFLOW,
  formatCurrency,
  formatDate,
  labelFor,
  lineTotal,
} from "../constants";
import { escapeHtml, openPrintWindow } from "@/lib/table-kit";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type {
  PoItemRecord,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
} from "../types";

export function PurchaseOrderShow({
  idParam = "id",
}: { idParam?: string } = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nested = useOutlet();
  const { result: record, query } = useShow<PurchaseOrderRecord>({
    resource: "hub_po_purchase_orders",
    id,
    meta: { appends: ["supplier", "owner"] },
  });

  const { result: items } = useList<PoItemRecord>({
    resource: "hub_po_items",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "id", order: "asc" }],
    filters: id ? [{ field: "purchase_order_id", operator: "eq", value: id }] : [],
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });

  const itemsSubtotal = useMemo(
    () =>
      items.data.reduce((sum, item) => sum + lineTotal(item.qty, item.unit_price), 0),
    [items.data]
  );

  const displayName =
    record?.po_number ||
    translate("procurement.po.detail.fallbackName", { ns: "starter" }, "Purchase order");

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          displayName
        )
      }
      description={translate(
        "procurement.po.drawer.show.description",
        { ns: "starter" },
        "Supplier, ownership and line items for this order."
      )}
      closeLabel={translate("procurement.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("procurement.common.copyLink", { ns: "starter" }, "Copy link")}
              onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            >
              <Link2 />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={translate("procurement.po.print.action", { ns: "starter" }, "Print order")}
              onClick={() => printPurchaseOrder({ order: record, items: items.data, locale })}
            >
              <Printer />
            </Button>
            <EditButton
              resource="hub_po_purchase_orders"
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          </div>
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
                "procurement.po.detail.loadError.title",
                { ns: "starter" },
                "Unable to load purchase order"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "procurement.po.detail.loadError.description",
                { ns: "starter" },
                "The order may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {record && <PoWorkflow order={record} itemsSubtotal={itemsSubtotal} />}
            <DetailItems
              title={translate("procurement.po.detail.title", { ns: "starter" }, "Order")}
              items={[
                [
                  translate("procurement.po.fields.supplier", { ns: "starter" }, "Supplier"),
                  record?.supplier?.name || "—",
                ],
                [
                  translate("procurement.po.fields.owner", { ns: "starter" }, "Owner"),
                  record?.owner?.nickname || record?.owner?.username || "—",
                ],
                [
                  translate("procurement.po.fields.status", { ns: "starter" }, "Status"),
                  <EnumBadge
                    key="status"
                    value={record?.status ?? "draft"}
                    label={labelFor(PO_STATUSES, record?.status ?? "draft", translate)}
                  />,
                ],
                [
                  translate("procurement.po.fields.orderDate", { ns: "starter" }, "Order date"),
                  formatDate(record?.order_date, locale),
                ],
                [
                  translate("procurement.po.fields.orderTotal", { ns: "starter" }, "Order total"),
                  <span key="total" className="tabular-nums">
                    {formatCurrency(record?.total, locale)}
                  </span>,
                ],
              ]}
            />
            {id ? (
              <>
                <Separator />
                <ItemsSection purchaseOrderId={id} locale={locale} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

/**
 * Workflow stepper plus the only status moves that are legal from here. The
 * total the order carries is reconciled against the line items, because that
 * mismatch is exactly what a buyer needs to see before sending an order out.
 */
function PoWorkflow({
  order,
  itemsSubtotal,
}: {
  order: PurchaseOrderRecord;
  itemsSubtotal: number;
}) {
  const translate = useTranslate();
  const locale = useLocale();
  const { mutate: updateOrder, mutation } = useUpdate<PurchaseOrderRecord>();
  const current: PurchaseOrderStatus = order.status ?? "draft";
  const targets = PO_TRANSITIONS[current] ?? [];
  const currentIndex = PO_WORKFLOW.indexOf(current);
  const storedTotal = Number(order.total ?? 0);
  const totalMismatch = Math.abs(storedTotal - itemsSubtotal) > 0.5;

  return (
    <div className="space-y-3">
      <ol className="flex items-center gap-2">
        {PO_WORKFLOW.map((stage, index) => {
          const done = currentIndex >= 0 && index <= currentIndex;
          return (
            <li key={stage} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  done ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {labelFor(PO_STATUSES, stage, translate)}
              </span>
              {index < PO_WORKFLOW.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1",
                    currentIndex > index ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {current === "cancelled" && (
        <p className="text-xs font-medium text-destructive">
          {translate(
            "procurement.po.workflow.cancelledNote",
            { ns: "starter" },
            "This order was cancelled. Reopen it as a draft to work on it again."
          )}
        </p>
      )}

      {totalMismatch && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {translate(
              "procurement.po.workflow.totalMismatch.title",
              { ns: "starter" },
              "Order total does not match the line items"
            )}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {translate(
                  "procurement.po.workflow.totalMismatch.description",
                  { ns: "starter" },
                  "Header says {{header}}, line items add up to {{items}}."
                )
                  .replace("{{header}}", formatCurrency(storedTotal, locale))
                  .replace("{{items}}", formatCurrency(itemsSubtotal, locale))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() =>
                  updateOrder({
                    resource: "hub_po_purchase_orders",
                    id: order.id,
                    values: { total: Math.round(itemsSubtotal * 100) / 100 },
                  })
                }
              >
                {translate(
                  "procurement.po.workflow.totalMismatch.sync",
                  { ns: "starter" },
                  "Recalculate from items"
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {targets.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {translate(
              "procurement.po.workflow.closed",
              { ns: "starter" },
              "This order is closed — no further moves."
            )}
          </span>
        ) : (
          targets.map((target) => {
            const blocked = target === "sent" && itemsSubtotal <= 0;
            return (
              <Button
                key={target}
                variant={target === "cancelled" ? "ghost" : "default"}
                size="sm"
                disabled={mutation.isPending || blocked}
                title={
                  blocked
                    ? translate(
                        "procurement.po.workflow.needsItems",
                        { ns: "starter" },
                        "Add at least one line item before sending this order"
                      )
                    : undefined
                }
                className={cn(
                  target === "cancelled" && "text-destructive hover:text-destructive"
                )}
                onClick={() =>
                  updateOrder({
                    resource: "hub_po_purchase_orders",
                    id: order.id,
                    values: { status: target },
                  })
                }
              >
                {translate(
                  PO_TRANSITION_LABELS[target].i18nKey,
                  { ns: "starter" },
                  PO_TRANSITION_LABELS[target].label
                )}
              </Button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Supplier-ready printable purchase order. */
function printPurchaseOrder({
  order,
  items,
  locale,
}: {
  order: PurchaseOrderRecord;
  items: PoItemRecord[];
  locale: string;
}) {
  const subtotal = items.reduce(
    (sum, item) => sum + lineTotal(item.qty, item.unit_price),
    0
  );
  const field = (label: string, value: string) =>
    `<div><span class="label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  const body = `
    <div class="doc-head">
      <div>
        <h1>Purchase order ${escapeHtml(order.po_number ?? "")}</h1>
        <p class="muted">${escapeHtml(order.supplier?.name ?? "")}</p>
      </div>
      <span class="badge">${escapeHtml(labelFor(PO_STATUSES, order.status))}</span>
    </div>
    <h2>Order</h2>
    <div class="grid">
      ${field("Supplier", order.supplier?.name ?? "—")}
      ${field("Supplier contact", order.supplier?.contact_name ?? "—")}
      ${field("Supplier email", order.supplier?.email ?? "—")}
      ${field("Buyer", order.owner?.nickname ?? order.owner?.username ?? "—")}
      ${field("Order date", formatDate(order.order_date, locale))}
      ${field("Order total", formatCurrency(order.total, locale))}
    </div>
    <h2>Line items</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Line total</th></tr>
      </thead>
      <tbody>
        ${
          items.length === 0
            ? '<tr><td colspan="5" class="muted">No line items</td></tr>'
            : items
                .map(
                  (item, index) =>
                    `<tr><td>${index + 1}</td><td>${escapeHtml(
                      item.product_name ?? ""
                    )}</td><td class="num">${escapeHtml(
                      item.qty ?? 0
                    )}</td><td class="num">${escapeHtml(
                      formatCurrency(item.unit_price, locale)
                    )}</td><td class="num">${escapeHtml(
                      formatCurrency(lineTotal(item.qty, item.unit_price), locale)
                    )}</td></tr>`
                )
                .join("")
        }
      </tbody>
      <tfoot>
        <tr><td colspan="4" class="num">Subtotal</td><td class="num">${escapeHtml(
          formatCurrency(subtotal, locale)
        )}</td></tr>
      </tfoot>
    </table>
    <footer>Printed ${escapeHtml(formatDate(new Date().toISOString(), locale))}</footer>
  `;

  openPrintWindow(`${order.po_number ?? "purchase-order"}`, body);
}

function ItemsSection({
  purchaseOrderId,
  locale,
}: {
  purchaseOrderId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const { result } = useList<PoItemRecord>({
    resource: "hub_po_items",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "id", order: "asc" }],
    filters: [
      { field: "purchase_order_id", operator: "eq", value: purchaseOrderId },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const items = result.data;
  const subtotal = items.reduce(
    (sum, item) => sum + lineTotal(item.qty, item.unit_price),
    0
  );

  return (
    <DrawerSection
      title={translate("procurement.po.items.title", { ns: "starter" }, "Line items")}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => openChild("items/create")}
        >
          <Plus />
          {translate("procurement.po.items.add", { ns: "starter" }, "Add item")}
        </Button>
      }
    >
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">
                {translate("procurement.po.items.product", { ns: "starter" }, "Product")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {translate("procurement.po.items.qty", { ns: "starter" }, "Qty")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {translate("procurement.po.items.unitPrice", { ns: "starter" }, "Unit price")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {translate("procurement.po.items.lineTotal", { ns: "starter" }, "Line total")}
              </th>
              <th className="px-3 py-2 font-medium">
                {translate("procurement.common.actions", { ns: "starter" }, "Actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  {translate(
                    "procurement.po.items.empty",
                    { ns: "starter" },
                    "No line items yet. Add the products on this order."
                  )}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={String(item.id)}>
                  <td className="px-3 py-2 font-medium">
                    {item.product_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.qty ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(item.unit_price, locale)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatCurrency(lineTotal(item.qty, item.unit_price), locale)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          openChild(
                            `items/edit/${encodeURIComponent(String(item.id))}`
                          )
                        }
                      >
                        <Pencil />
                      </Button>
                      <DeleteButton
                        resource="hub_po_items"
                        recordItemId={item.id}
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 />
                      </DeleteButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {items.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/20">
                <td
                  colSpan={3}
                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                >
                  {translate(
                    "procurement.po.items.subtotal",
                    { ns: "starter" },
                    "Items subtotal"
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatCurrency(subtotal, locale)}
                </td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </DrawerSection>
  );
}
