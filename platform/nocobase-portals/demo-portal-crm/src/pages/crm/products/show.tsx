import { useList, useOne, useTranslate } from "@refinedev/core";
import { CheckCircle2, Pencil } from "lucide-react";
import { useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  PRODUCT_CATEGORIES,
  QUOTE_STATUSES,
  formatCurrency,
  labelFor,
} from "../constants";
import { RecordLink, useOpenRecord } from "../record-links";
import { RecordPager } from "../record-pager";
import { useTrackRecentRecord } from "../recent-records";
import { crmRoutes } from "../routes";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { AuditTrail, CopyLinkButton } from "../audit-trail";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import type { ProductRecord, QuoteItemRecord } from "../types";

export function ProductShow({ idParam = "id" }: { idParam?: string }) {
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const translate = useTranslate();
  const locale = useLocale();
  const closeTo = useContextualCloseTo();
  const openChild = useOpenContextualChild();
  const openRecord = useOpenRecord();

  const { result: product, query } = useOne<ProductRecord>({
    resource: "crm_products",
    id,
    meta: { appends: ["createdBy", "updatedBy"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  useTrackRecentRecord("product", product?.id, product?.name);

  const usage = useList<QuoteItemRecord>({
    resource: "crm_quote_items",
    filters: id ? [{ field: "product_id", operator: "eq", value: id }] : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 25 },
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { appends: ["quote", "quote.customer"] },
    errorNotification: false,
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  const lineItems = usage.result.data;
  const quotedUnits = lineItems.reduce(
    (sum, item) => sum + Number(item.qty ?? 0),
    0
  );
  const quotedValue = lineItems.reduce(
    (sum, item) => sum + Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
    0
  );

  return (
    <RouteDrawer
      className={DRAWER_WIDE}
      title={
        product?.name ??
        translate("crm.products.detail.title", { ns: "starter" }, "Product details")
      }
      description={translate(
        "crm.products.detail.description",
        { ns: "starter" },
        "List price, availability and the quotes that include this SKU."
      )}
      closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      actions={
        <div className="flex items-center gap-2">
          {idParam === "id" ? (
            <RecordPager
              kind="product"
              id={id}
              buildPath={(next) => `../show/${next}`}
            />
          ) : null}
          <CopyLinkButton />
          {product ? (
            <Button
              variant="outline"
              onClick={() => openChild(`${crmRoutes.products}/edit/${product.id}`)}
            >
              <Pencil />
              {translate("crm.common.edit", { ns: "starter" }, "Edit")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : product ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  {translate("crm.products.fields.price", { ns: "starter" }, "Unit price")}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCurrency(product.unit_price, locale)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {product.sku}
                </Badge>
                {product.active ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4" />
                    {translate("crm.products.active", { ns: "starter" }, "Active")}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {translate("crm.products.inactive", { ns: "starter" }, "Inactive")}
                  </span>
                )}
              </div>
            </div>

            <DetailItems
              title={translate("crm.products.detail.summary", { ns: "starter" }, "Product summary")}
              items={[
                [
                  translate("crm.products.fields.category", { ns: "starter" }, "Category"),
                  <EnumBadge
                    key="category"
                    value={product.category}
                    label={labelFor(PRODUCT_CATEGORIES, product.category, translate)}
                  />,
                ],
                [
                  translate("crm.products.detail.quotedUnits", { ns: "starter" }, "Units quoted"),
                  String(quotedUnits),
                ],
                [
                  translate("crm.products.detail.quotedValue", { ns: "starter" }, "Quoted value"),
                  formatCurrency(quotedValue, locale),
                ],
                [
                  translate("crm.products.detail.quoteCount", { ns: "starter" }, "Quotes including it"),
                  String(lineItems.length),
                ],
              ]}
            />

            <Separator />
            <DrawerSection
              title={translate(
                "crm.products.detail.quotes",
                { ns: "starter" },
                "Quotes including this product"
              )}
            >
              {lineItems.length ? (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {translate("crm.quotes.fields.number", { ns: "starter" }, "Quote")}
                        </TableHead>
                        <TableHead>
                          {translate("crm.quotes.fields.customer", { ns: "starter" }, "Customer")}
                        </TableHead>
                        <TableHead>
                          {translate("crm.quotes.fields.status", { ns: "starter" }, "Status")}
                        </TableHead>
                        <TableHead className="text-right">
                          {translate("crm.quotes.items.qty", { ns: "starter" }, "Qty")}
                        </TableHead>
                        <TableHead className="text-right">
                          {translate("crm.quotes.items.lineTotal", { ns: "starter" }, "Line total")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item) => (
                        <TableRow key={String(item.id)}>
                          <TableCell className="font-mono text-sm font-semibold">
                            <RecordLink
                              label={item.quote?.quote_number}
                              onClick={() =>
                                item.quote?.id && openRecord.quote(item.quote.id)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <RecordLink
                              label={item.quote?.customer?.company_name}
                              onClick={() =>
                                item.quote?.customer_id &&
                                openRecord.customer(item.quote.customer_id)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <EnumBadge
                              value={item.quote?.status}
                              label={labelFor(QUOTE_STATUSES, item.quote?.status, translate)}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.qty}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(
                              Number(item.qty ?? 0) * Number(item.unit_price ?? 0),
                              locale
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate(
                    "crm.products.detail.quotesEmpty",
                    { ns: "starter" },
                    "This product has not been quoted yet."
                  )}
                </p>
              )}
            </DrawerSection>

            <AuditTrail record={product} locale={locale} />
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}
