import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTile = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "danger";
  /** Present = the tile drills the list down to the matching records. */
  onClick?: () => void;
  active?: boolean;
};

const TONES: Record<NonNullable<KpiTile["tone"]>, string> = {
  default: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  positive: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/12 text-red-600 dark:text-red-400",
};

/**
 * Summary strip above a list. Every tile is a filter: clicking "Overdue"
 * narrows the grid below instead of just reporting a number.
 */
export function KpiBar({
  tiles,
  loading,
}: {
  tiles: KpiTile[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.id} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const interactive = Boolean(tile.onClick);
        return (
          <button
            key={tile.id}
            type="button"
            disabled={!interactive}
            onClick={tile.onClick}
            className={cn(
              "flex flex-col items-start rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors",
              interactive && "hover:border-primary/40 hover:bg-accent/40",
              tile.active && "border-primary/60 bg-primary/5"
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {tile.label}
              </span>
              {Icon ? (
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md",
                    TONES[tile.tone ?? "default"]
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {tile.value}
            </p>
            {tile.hint ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {tile.hint}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
