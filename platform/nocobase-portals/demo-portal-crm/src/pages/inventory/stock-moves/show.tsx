import { useShow, useTranslate } from "@refinedev/core";
import { Pencil } from "lucide-react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { DetailItems, EnumBadge, useLocale } from "../shared";
import type { StockMoveRecord } from "../types";

export function StockMoveShow({
  idParam = "id",
  embedded = false,
}: {
  idParam?: string;
  embedded?: boolean;
} = {}) {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const nestedOutlet = useOutlet();
  const { result: record, query } = useShow<StockMoveRecord>({
    resource: "hub_inv_stock_moves",
    id,
    meta: { appends: ["product", "warehouse"] },
  });

  const title = translate(
    "inventory.stockMoves.drawer.show.title",
    { ns: "starter" },
    "Stock move"
  );

  return (
    <RouteDrawer
      title={query.isLoading && !record ? <Skeleton className="h-6 w-40" /> : title}
      description={translate(
        "inventory.stockMoves.drawer.show.description",
        { ns: "starter" },
        "Details of this stock movement."
      )}
      closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nestedOutlet}
      actions={
        record && !embedded ? (
          <EditButton
            resource="hub_inv_stock_moves"
            recordItemId={record.id}
            variant="outline"
            size="icon-sm"
            aria-label={translate("inventory.stockMoves.actions.edit", { ns: "starter" }, "Edit move")}
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
                "inventory.stockMoves.detail.loadError.title",
                { ns: "starter" },
                "Unable to load stock move"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "inventory.stockMoves.detail.loadError.description",
                { ns: "starter" },
                "The stock move may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <DetailItems
            title={translate("inventory.stockMoves.detail.overview", { ns: "starter" }, "Overview")}
            items={[
              [
                translate("inventory.stockMoves.fields.type", { ns: "starter" }, "Type"),
                <EnumBadge
                  key="type"
                  value={record?.type ?? "in"}
                  label={record?.type ? labelFor(MOVE_TYPES, record.type, translate) : "—"}
                />,
              ],
              [
                translate("inventory.stockMoves.fields.qty", { ns: "starter" }, "Qty"),
                <span key="qty" className="tabular-nums font-medium">
                  {signedQty(record?.type, record?.qty) > 0 ? "+" : ""}
                  {signedQty(record?.type, record?.qty)}
                </span>,
              ],
              [
                translate("inventory.stockMoves.fields.movedAt", { ns: "starter" }, "Moved at"),
                formatDateTime(record?.moved_at, locale),
              ],
              [
                translate("inventory.stockMoves.fields.product", { ns: "starter" }, "Product"),
                record?.product?.name || "—",
              ],
              [
                translate("inventory.stockMoves.fields.warehouse", { ns: "starter" }, "Warehouse"),
                record?.warehouse?.name || "—",
              ],
              [
                translate("inventory.stockMoves.fields.note", { ns: "starter" }, "Note"),
                record?.note || "—",
              ],
            ]}
          />
        )}
      </div>
    </RouteDrawer>
  );
}
