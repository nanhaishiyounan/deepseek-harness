import { useTranslate } from "@refinedev/core";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Eye,
  Inbox,
  Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  DEAL_STAGES,
  formatCurrency,
  formatDate,
  labelFor,
} from "../constants";
import { EnumBadge, userLabel } from "../shared";
import type { GridDensity } from "../grid";
import type { EnrichedDeal } from "./use-deal-data";

type SortKey =
  | "title"
  | "account"
  | "stage"
  | "amount"
  | "weighted"
  | "close"
  | "lastTouch"
  | "owner";

type DealTableProps = {
  deals: EnrichedDeal[];
  locale: string;
  density: GridDensity;
  selected: Array<string | number>;
  onToggleRow: (id: string | number) => void;
  onToggleAll: (ids: Array<string | number>) => void;
  onOpen: (deal: EnrichedDeal) => void;
  onEdit: (deal: EnrichedDeal) => void;
};

const PAGE_SIZE = 25;

/**
 * Table view over the same in-memory pipeline the board renders. Sorting and
 * paging are client-side on purpose: the derived columns (weighted value, days
 * to close, last activity) don't exist on the server and so can't be sorted
 * there.
 */
export function DealTable({
  deals,
  locale,
  density,
  selected,
  onToggleRow,
  onToggleAll,
  onOpen,
  onEdit,
}: DealTableProps) {
  const translate = useTranslate();
  const [sortKey, setSortKey] = useState<SortKey>("close");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const value = (deal: EnrichedDeal): string | number => {
      switch (sortKey) {
        case "title":
          return deal.title ?? "";
        case "account":
          return deal.account?.name ?? "";
        case "stage":
          return DEAL_STAGES.findIndex(
            (stage) => stage.value === (deal.stage ?? "inquiry")
          );
        case "amount":
          return Number(deal.amount ?? 0);
        case "weighted":
          return deal.weighted;
        case "lastTouch":
          return deal.lastTouchDays ?? Number.MAX_SAFE_INTEGER;
        case "owner":
          return userLabel(deal.owner);
        default:
          return deal.expected_close_date ?? "9999";
      }
    };
    const list = [...deals].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      if (typeof a === "number" && typeof b === "number") return a - b;
      return String(a).localeCompare(String(b));
    });
    return descending ? list.reverse() : list;
  }, [deals, sortKey, descending]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const cellPadding = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const allSelected =
    rows.length > 0 && rows.every((deal) => selected.includes(deal.id));

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((value) => !value);
      return;
    }
    setSortKey(key);
    setDescending(false);
  };

  const header = (key: SortKey, label: string, align?: "right") => (
    <th
      className={cn(
        cellPadding,
        "text-left text-xs font-medium text-muted-foreground",
        align === "right" && "text-right"
      )}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          sortKey === key && "text-foreground"
        )}
      >
        {label}
        {sortKey !== key ? (
          <ChevronsUpDown className="size-3 opacity-50" />
        ) : descending ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUp className="size-3" />
        )}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/45">
            <tr className="border-b">
              <th className={cn("w-10", cellPadding)}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={
                    rows.some((deal) => selected.includes(deal.id)) &&
                    !allSelected
                  }
                  onCheckedChange={() => onToggleAll(rows.map((deal) => deal.id))}
                  aria-label={translate(
                    "sales.grid.selectAll",
                    { ns: "starter" },
                    "Select all rows on this page"
                  )}
                />
              </th>
              {header(
                "title",
                translate("sales.deals.fields.title", { ns: "starter" }, "Deal")
              )}
              {header(
                "account",
                translate("sales.deals.fields.account", { ns: "starter" }, "Account")
              )}
              {header(
                "stage",
                translate("sales.deals.fields.stage", { ns: "starter" }, "Stage")
              )}
              {header(
                "amount",
                translate("sales.deals.fields.amount", { ns: "starter" }, "Amount"),
                "right"
              )}
              {header(
                "weighted",
                translate(
                  "sales.deals.columns.weighted",
                  { ns: "starter" },
                  "Weighted"
                ),
                "right"
              )}
              {header(
                "close",
                translate(
                  "sales.deals.fields.expectedClose",
                  { ns: "starter" },
                  "Expected close"
                )
              )}
              {header(
                "lastTouch",
                translate(
                  "sales.deals.columns.lastActivity",
                  { ns: "starter" },
                  "Last activity"
                )
              )}
              {header(
                "owner",
                translate("sales.deals.fields.owner", { ns: "starter" }, "Owner")
              )}
              <th
                className={cn(
                  cellPadding,
                  "w-24 text-right text-xs font-medium text-muted-foreground"
                )}
              >
                {translate("sales.common.actions", { ns: "starter" }, "Actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-16">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Inbox className="size-5" />
                    </span>
                    <p className="text-sm font-medium">
                      {translate(
                        "sales.pipeline.table.empty",
                        { ns: "starter" },
                        "No deals match these filters"
                      )}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((deal) => (
                <tr
                  key={String(deal.id)}
                  className={cn(
                    "group/row transition-colors hover:bg-muted/40",
                    selected.includes(deal.id) && "bg-primary/5"
                  )}
                >
                  <td className={cellPadding}>
                    <Checkbox
                      checked={selected.includes(deal.id)}
                      onCheckedChange={() => onToggleRow(deal.id)}
                      aria-label={translate(
                        "sales.grid.selectRow",
                        { ns: "starter" },
                        "Select row"
                      )}
                    />
                  </td>
                  <td className={cn(cellPadding, "font-medium")}>
                    <button
                      type="button"
                      className="text-left text-primary underline-offset-2 hover:underline"
                      onClick={() => onOpen(deal)}
                    >
                      {deal.title || "—"}
                    </button>
                  </td>
                  <td className={cellPadding}>{deal.account?.name || "—"}</td>
                  <td className={cellPadding}>
                    <EnumBadge
                      value={deal.stage ?? "inquiry"}
                      label={labelFor(
                        DEAL_STAGES,
                        deal.stage ?? "inquiry",
                        translate
                      )}
                    />
                  </td>
                  <td className={cn(cellPadding, "text-right tabular-nums")}>
                    {formatCurrency(deal.amount, locale)}
                  </td>
                  <td
                    className={cn(
                      cellPadding,
                      "text-right tabular-nums text-muted-foreground"
                    )}
                  >
                    {formatCurrency(deal.weighted, locale)}
                  </td>
                  <td className={cellPadding}>
                    <span
                      className={cn(
                        "whitespace-nowrap",
                        deal.isOverdue &&
                          "font-medium text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatDate(deal.expected_close_date, locale)}
                    </span>
                    {deal.isOpen && deal.daysToClose !== null ? (
                      <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                        {deal.daysToClose >= 0
                          ? translate(
                              "sales.deals.columns.daysLeft",
                              { ns: "starter" },
                              "in {{days}}d"
                            ).replace("{{days}}", String(deal.daysToClose))
                          : translate(
                              "sales.deals.columns.daysOverdue",
                              { ns: "starter" },
                              "{{days}}d late"
                            ).replace("{{days}}", String(-deal.daysToClose))}
                      </span>
                    ) : null}
                  </td>
                  <td className={cellPadding}>
                    {deal.lastTouchDays === null ? (
                      <span className="text-muted-foreground">
                        {translate(
                          "sales.pipeline.card.neverTouched",
                          { ns: "starter" },
                          "No activity"
                        )}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "flex items-center gap-1 whitespace-nowrap tabular-nums",
                          deal.isStale
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-muted-foreground"
                        )}
                      >
                        {deal.isStale ? <Clock className="size-3" /> : null}
                        {translate(
                          "sales.deals.columns.daysAgo",
                          { ns: "starter" },
                          "{{days}}d ago"
                        ).replace("{{days}}", String(deal.lastTouchDays))}
                      </span>
                    )}
                  </td>
                  <td className={cellPadding}>{userLabel(deal.owner)}</td>
                  <td className={cn(cellPadding, "text-right")}>
                    <div className="flex items-center justify-end gap-0.5 md:opacity-0 md:group-hover/row:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onOpen(deal)}
                      >
                        <Eye />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(deal)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted-foreground">
          {translate(
            "sales.grid.range",
            { ns: "starter" },
            "Showing {{first}}–{{last}} of {{total}}"
          )
            .replace(
              "{{first}}",
              String(sorted.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1)
            )
            .replace("{{last}}", String(Math.min(current * PAGE_SIZE, sorted.length)))
            .replace("{{total}}", String(sorted.length))}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
            aria-label={translate(
              "sales.grid.prevPage",
              { ns: "starter" },
              "Previous page"
            )}
          >
            <ChevronLeft />
          </Button>
          <span className="px-1 text-sm tabular-nums">
            {translate("sales.grid.pageOf", { ns: "starter" }, "{{page}} / {{count}}")
              .replace("{{page}}", String(current))
              .replace("{{count}}", String(pageCount))}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={current >= pageCount}
            onClick={() => setPage(current + 1)}
            aria-label={translate(
              "sales.grid.nextPage",
              { ns: "starter" },
              "Next page"
            )}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
