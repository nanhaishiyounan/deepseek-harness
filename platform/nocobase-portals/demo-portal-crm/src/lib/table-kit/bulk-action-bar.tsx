import { useTranslate } from "@refinedev/core";
import { Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type BulkActionBarProps = {
  count: number;
  onClear: () => void;
  onDelete?: () => void;
  isBusy?: boolean;
  children?: ReactNode;
  i18nPrefix?: string;
};

export function BulkActionBar({
  count,
  onClear,
  onDelete,
  isBusy,
  children,
  i18nPrefix = "finance.ops",
}: BulkActionBarProps) {
  const translate = useTranslate();
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm font-medium">
        {translate(
          `${i18nPrefix}.selected`,
          { ns: "starter" },
          "{{count}} selected"
        ).replace("{{count}}", String(count))}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {children}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            disabled={isBusy}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            {translate(
              `${i18nPrefix}.bulkDelete`,
              { ns: "starter" },
              "Delete"
            )}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
          <X className="size-3.5" />
          {translate(
            `${i18nPrefix}.clearSelection`,
            { ns: "starter" },
            "Clear"
          )}
        </Button>
      </div>
    </div>
  );
}
