import { useTranslate } from "@refinedev/core";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type AsyncPanelProps = {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  skeletonRows?: number;
  children: ReactNode;
  i18nPrefix?: string;
};

export function AsyncPanel({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  emptyTitle,
  emptyDescription,
  skeletonRows = 4,
  children,
  i18nPrefix = "finance.ops",
}: AsyncPanelProps) {
  const translate = useTranslate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">
          {translate(
            `${i18nPrefix}.error.title`,
            { ns: "starter" },
            "Something went wrong"
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {translate(
            `${i18nPrefix}.error.description`,
            { ns: "starter" },
            "The data could not be loaded. Check your connection and try again."
          )}
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="size-3.5" />
            {translate(`${i18nPrefix}.error.retry`, { ns: "starter" }, "Retry")}
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">
          {emptyTitle ??
            translate(
              `${i18nPrefix}.empty.title`,
              { ns: "starter" },
              "Nothing here yet"
            )}
        </p>
        {emptyDescription && (
          <p className="text-xs text-muted-foreground">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
