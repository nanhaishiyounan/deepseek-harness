import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiTile = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  onClick?: () => void;
  active?: boolean;
};

export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const interactive = Boolean(tile.onClick);
        return (
          <Card
            key={tile.key}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={tile.onClick}
            onKeyDown={(event) => {
              if (interactive && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                tile.onClick?.();
              }
            }}
            className={cn(
              "overflow-hidden transition-colors",
              interactive && "cursor-pointer hover:border-primary/40",
              tile.active && "border-primary/60 ring-1 ring-primary/25"
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{tile.label}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
                    {tile.value}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    tile.tone
                  )}
                >
                  <Icon className="size-5" />
                </span>
              </div>
              {tile.hint && (
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  {tile.hint}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
