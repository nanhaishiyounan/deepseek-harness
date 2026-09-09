import { useTranslate } from "@refinedev/core";
import { AlertTriangle, Clock, MoveRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEAL_STAGES,
  STAGE_PROBABILITY,
  canTransition,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  labelFor,
  nextStages,
} from "../constants";
import type { EnrichedDeal } from "./use-deal-data";

const STAGE_DOT: Record<string, string> = {
  inquiry: "bg-blue-500",
  quote: "bg-cyan-500",
  negotiation: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-red-500",
};

type BoardProps = {
  deals: EnrichedDeal[];
  locale: string;
  onOpen: (deal: EnrichedDeal) => void;
  onMove: (deal: EnrichedDeal, stage: string) => void;
  onIllegalMove: (deal: EnrichedDeal, stage: string) => void;
};

/**
 * Kanban pipeline. Drops are validated against the stage machine, so a deal
 * cannot jump from Inquiry straight to Negotiation — the column refuses the
 * drop and says why, the way a real opportunity path does.
 */
export function PipelineBoard({
  deals,
  locale,
  onOpen,
  onMove,
  onIllegalMove,
}: BoardProps) {
  const translate = useTranslate();
  const [dragging, setDragging] = useState<EnrichedDeal | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const grouped = DEAL_STAGES.map((stage) => ({
    stage: stage.value as string,
    label: labelFor(DEAL_STAGES, stage.value, translate),
    deals: deals
      .filter((deal) => (deal.stage ?? "inquiry") === stage.value)
      .sort((left, right) =>
        (left.expected_close_date ?? "9999").localeCompare(
          right.expected_close_date ?? "9999"
        )
      ),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {grouped.map((column) => {
        const total = column.deals.reduce(
          (sum, deal) => sum + Number(deal.amount ?? 0),
          0
        );
        const weighted = column.deals.reduce(
          (sum, deal) => sum + deal.weighted,
          0
        );
        const droppable =
          dragging === null ||
          (dragging.stage ?? "inquiry") === column.stage ||
          canTransition(dragging.stage, column.stage);

        return (
          <div
            key={column.stage}
            className={cn(
              "flex min-h-72 flex-col rounded-xl border bg-muted/25 transition-colors",
              hovered === column.stage && droppable && "border-primary/60 bg-primary/5",
              hovered === column.stage && !droppable && "border-destructive/60 bg-destructive/5",
              dragging !== null && !droppable && "opacity-60"
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setHovered(column.stage);
            }}
            onDragLeave={() => setHovered(null)}
            onDrop={(event) => {
              event.preventDefault();
              setHovered(null);
              const id = event.dataTransfer.getData("text/plain");
              const deal = deals.find((item) => String(item.id) === id);
              setDragging(null);
              if (!deal) return;
              if ((deal.stage ?? "inquiry") === column.stage) return;
              if (!canTransition(deal.stage, column.stage)) {
                onIllegalMove(deal, column.stage);
                return;
              }
              onMove(deal, column.stage);
            }}
          >
            <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    STAGE_DOT[column.stage] ?? "bg-muted-foreground"
                  )}
                />
                <span className="truncate text-sm font-semibold">
                  {column.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {column.deals.length}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium tabular-nums">
                  {formatCurrencyCompact(total, locale)}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {translate(
                    "sales.pipeline.column.weighted",
                    { ns: "starter" },
                    "≈ {{value}} weighted"
                  ).replace(
                    "{{value}}",
                    formatCurrencyCompact(weighted, locale)
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
              {column.deals.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {translate(
                    "sales.pipeline.emptyColumn",
                    { ns: "starter" },
                    "Drop a deal here"
                  )}
                </p>
              ) : (
                column.deals.map((deal) => (
                  <DealCard
                    key={String(deal.id)}
                    deal={deal}
                    locale={locale}
                    onOpen={() => onOpen(deal)}
                    onMove={onMove}
                    onDragStart={() => setDragging(deal)}
                    onDragEnd={() => {
                      setDragging(null);
                      setHovered(null);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealCard({
  deal,
  locale,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  deal: EnrichedDeal;
  locale: string;
  onOpen: () => void;
  onMove: (deal: EnrichedDeal, stage: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const translate = useTranslate();
  const forward = nextStages(deal.stage)[0];
  const probability = Math.round(
    (STAGE_PROBABILITY[deal.stage ?? "inquiry"] ?? 0) * 100
  );

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", String(deal.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group/card flex cursor-grab flex-col gap-1.5 rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={onOpen}
        className="line-clamp-2 text-left text-sm font-medium hover:underline"
      >
        {deal.title || "—"}
      </button>
      <span className="truncate text-xs text-muted-foreground">
        {deal.account?.name ||
          translate("sales.pipeline.noAccount", { ns: "starter" }, "No account")}
      </span>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(deal.amount, locale)}
        </span>
        {deal.expected_close_date ? (
          <span
            className={cn(
              "flex items-center gap-1 text-xs tabular-nums",
              deal.isOverdue
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-muted-foreground"
            )}
          >
            {deal.isOverdue ? <AlertTriangle className="size-3" /> : null}
            {formatDate(deal.expected_close_date, locale)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {deal.isOpen ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
            {translate(
              "sales.pipeline.card.probability",
              { ns: "starter" },
              "{{value}}% likely"
            ).replace("{{value}}", String(probability))}
          </span>
        ) : null}
        {deal.isStale ? (
          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <Clock className="size-3" />
            {deal.lastTouchDays === null
              ? translate(
                  "sales.pipeline.card.neverTouched",
                  { ns: "starter" },
                  "No activity"
                )
              : translate(
                  "sales.pipeline.card.silentDays",
                  { ns: "starter" },
                  "{{days}}d silent"
                ).replace("{{days}}", String(deal.lastTouchDays))}
          </span>
        ) : null}
      </div>

      {forward ? (
        <Button
          variant="outline"
          size="xs"
          className="mt-1 w-full opacity-100 md:opacity-0 md:group-hover/card:opacity-100"
          onClick={() => onMove(deal, forward)}
        >
          <MoveRight />
          {translate(
            "sales.pipeline.card.advance",
            { ns: "starter" },
            "Move to {{stage}}"
          ).replace("{{stage}}", labelFor(DEAL_STAGES, forward, translate))}
        </Button>
      ) : null}
    </div>
  );
}
