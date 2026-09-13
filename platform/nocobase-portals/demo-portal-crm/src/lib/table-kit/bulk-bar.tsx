import { useTranslate } from "@refinedev/core";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function BulkBar({
  count,
  onClear,
  children,
  i18nPrefix = "hr.toolkit",
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
      <span className="text-sm font-medium tabular-nums">
        {translate(
          `${i18nPrefix}.selected`,
          { ns: "starter", count },
          `${count} selected`
        )}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto text-muted-foreground"
        onClick={onClear}
      >
        <X className="size-4" />
        {translate(
          `${i18nPrefix}.clearSelection`,
          { ns: "starter" },
          "Clear"
        )}
      </Button>
    </div>
  );
}
