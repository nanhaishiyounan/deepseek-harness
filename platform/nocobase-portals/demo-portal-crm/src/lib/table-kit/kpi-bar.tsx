import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
};

export function KpiBar({
  items,
  className,
}: {
  items: KpiItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {items.map((item) => {
        const interactive = Boolean(item.onClick);
        return (
          <Card
            key={item.key}
            className={cn(
              "overflow-hidden transition-colors",
              interactive && "cursor-pointer hover:border-primary/50",
              item.active && "border-primary ring-1 ring-primary/30"
            )}
            onClick={item.onClick}
          >
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-muted-foreground">
                  {item.label}
                </p>
                {item.icon ? (
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      item.tone ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.icon}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                {item.value}
              </p>
              {item.hint ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {item.hint}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
