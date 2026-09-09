import { useList, useShow, useTranslate } from "@refinedev/core";
import { Pencil } from "lucide-react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EditButton } from "@/components/resources/buttons/edit";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  PO_STATUSES,
  SUPPLIER_STATUSES,
  formatCurrency,
  formatDate,
  labelFor,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  DetailItems,
  DrawerSection,
  EnumBadge,
  RatingStars,
  useLocale,
} from "../shared";
import type { PurchaseOrderRecord, SupplierRecord } from "../types";

export function SupplierShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const { result: record, query } = useShow<SupplierRecord>({
    resource: "hub_po_suppliers",
    id,
  });

  const displayName =
    record?.name ||
    translate("procurement.suppliers.detail.fallbackName", { ns: "starter" }, "Unnamed supplier");

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
        "procurement.suppliers.drawer.show.description",
        { ns: "starter" },
        "Profile and purchase orders for this vendor."
      )}
      closeLabel={translate("procurement.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <EditButton
            resource="hub_po_suppliers"
            recordItemId={record.id}
            variant="outline"
            size="icon-sm"
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
                "procurement.suppliers.detail.loadError.title",
                { ns: "starter" },
                "Unable to load supplier"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "procurement.suppliers.detail.loadError.description",
                { ns: "starter" },
                "The supplier may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("procurement.suppliers.detail.profile", { ns: "starter" }, "Profile")}
              items={[
                [
                  translate("procurement.suppliers.detail.contact", { ns: "starter" }, "Contact"),
                  record?.contact_name || "—",
                ],
                [
                  translate("procurement.suppliers.detail.email", { ns: "starter" }, "Email"),
                  record?.email ? (
                    <a
                      key="email"
                      href={`mailto:${record.email}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {record.email}
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate("procurement.suppliers.detail.rating", { ns: "starter" }, "Rating"),
                  <RatingStars key="rating" value={record?.rating} />,
                ],
                [
                  translate("procurement.suppliers.detail.status", { ns: "starter" }, "Status"),
                  <EnumBadge
                    key="status"
                    value={record?.status ?? "active"}
                    label={labelFor(SUPPLIER_STATUSES, record?.status ?? "active", translate)}
                  />,
                ],
              ]}
            />
            {id ? (
              <>
                <Separator />
                <SupplierOrdersSection supplierId={id} locale={locale} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

function SupplierOrdersSection({
  supplierId,
  locale,
}: {
  supplierId: string;
  locale: string;
}) {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const { result } = useList<PurchaseOrderRecord>({
    resource: "hub_po_purchase_orders",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    sorters: [{ field: "order_date", order: "desc" }],
    filters: [{ field: "supplier_id", operator: "eq", value: supplierId }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const orders = result.data;
  const spend = orders
    .filter((po) => po.status !== "cancelled")
    .reduce((sum, po) => sum + Number(po.total ?? 0), 0);

  // Vendor scorecard from the order history: how much has actually landed, how
  // much is still in flight, and how often an order gets cancelled.
  const performance = (() => {
    const received = orders.filter((po) => po.status === "received");
    const cancelled = orders.filter((po) => po.status === "cancelled");
    const open = orders.filter(
      (po) => po.status === "draft" || po.status === "sent"
    );
    const receivedValue = received.reduce(
      (sum, po) => sum + Number(po.total ?? 0),
      0
    );
    const billable = orders.length - cancelled.length;
    return {
      orderCount: orders.length,
      fulfilmentRate: billable > 0 ? (received.length / billable) * 100 : 0,
      cancellationRate:
        orders.length > 0 ? (cancelled.length / orders.length) * 100 : 0,
      averageOrderValue: billable > 0 ? spend / billable : 0,
      receivedValue,
      openValue: open.reduce((sum, po) => sum + Number(po.total ?? 0), 0),
    };
  })();

  const metrics: Array<[string, string]> = [
    [
      translate("procurement.suppliers.performance.orders", { ns: "starter" }, "Orders placed"),
      String(performance.orderCount),
    ],
    [
      translate("procurement.suppliers.performance.fulfilment", { ns: "starter" }, "Fulfilment rate"),
      `${Math.round(performance.fulfilmentRate)}%`,
    ],
    [
      translate("procurement.suppliers.performance.cancellation", { ns: "starter" }, "Cancellation rate"),
      `${Math.round(performance.cancellationRate)}%`,
    ],
    [
      translate("procurement.suppliers.performance.aov", { ns: "starter" }, "Average order value"),
      formatCurrency(performance.averageOrderValue, locale),
    ],
    [
      translate("procurement.suppliers.performance.received", { ns: "starter" }, "Value received"),
      formatCurrency(performance.receivedValue, locale),
    ],
    [
      translate("procurement.suppliers.performance.open", { ns: "starter" }, "Open commitment"),
      formatCurrency(performance.openValue, locale),
    ],
  ];

  return (
    <>
    <DrawerSection
      title={translate(
        "procurement.suppliers.performance.title",
        { ns: "starter" },
        "Performance"
      )}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </DrawerSection>

    <DrawerSection
      title={translate("procurement.suppliers.orders.title", { ns: "starter" }, "Purchase orders")}
      action={
        <span className="text-xs text-muted-foreground">
          {translate(
            "procurement.suppliers.orders.summary",
            { ns: "starter", count: orders.length, amount: formatCurrency(spend, locale) },
            `${orders.length} order${orders.length === 1 ? "" : "s"} · ${formatCurrency(spend, locale)} committed`
          )}
        </span>
      }
    >
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">
                {translate("procurement.suppliers.orders.poNumber", { ns: "starter" }, "PO number")}
              </th>
              <th className="px-3 py-2 font-medium">
                {translate("procurement.suppliers.orders.status", { ns: "starter" }, "Status")}
              </th>
              <th className="px-3 py-2 font-medium">
                {translate("procurement.suppliers.orders.orderDate", { ns: "starter" }, "Order date")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {translate("procurement.suppliers.orders.total", { ns: "starter" }, "Total")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  {translate(
                    "procurement.suppliers.orders.empty",
                    { ns: "starter" },
                    "No purchase orders raised for this supplier yet."
                  )}
                </td>
              </tr>
            ) : (
              orders.map((po) => (
                <tr
                  key={String(po.id)}
                  onClick={() =>
                    openChild(`po/show/${encodeURIComponent(String(po.id))}`)
                  }
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <td className="px-3 py-2 font-medium">{po.po_number || "—"}</td>
                  <td className="px-3 py-2">
                    <EnumBadge
                      value={po.status}
                      label={labelFor(PO_STATUSES, po.status, translate)}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(po.order_date, locale)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(po.total, locale)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DrawerSection>
    </>
  );
}
