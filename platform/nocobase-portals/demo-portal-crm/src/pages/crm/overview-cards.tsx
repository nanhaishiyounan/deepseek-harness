import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  loading,
  onClick,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  /** Turns the card into a drill-down into the records behind the number. */
  onClick?: () => void;
}) {
  return (
    <Card
      className={
        onClick
          ? "relative cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/30"
          : "relative"
      }
      onClick={onClick}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400" />
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
            )}
            {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
          </div>
          {icon ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChartCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
