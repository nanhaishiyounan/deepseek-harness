import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { CreateButton } from "@/components/resources/buttons/create";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Option } from "./constants";

/** USD currency, no cents for the big numbers, cents for line items. */
export function money(value: number | null | undefined, cents = false): string {
  const n = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

/** Compact medium date, e.g. "Jul 12, 2026". */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/**
 * Colored status / category pill. Pass `label` to render a translated string;
 * otherwise the option's baked-in English label is used.
 */
export function Pill({ option, label }: { option: Option; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        option.tone
      )}
    >
      {label ?? option.label}
    </span>
  );
}

/** Page header shared by every Finance screen. */
export function PageHeader({
  title,
  description,
  createResource,
  createLabel,
  actions,
}: {
  title: string;
  description: string;
  createResource?: string;
  createLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-semibold tracking-[-0.035em]">{title}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {createResource ? (
          <CreateButton resource={createResource}>{createLabel}</CreateButton>
        ) : null}
      </div>
    </div>
  );
}

/** Compact KPI stat card for the dashboard + list summary rows. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon ? (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                tone ?? "bg-blue-500/12 text-blue-600 dark:text-blue-400"
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Section heading + optional action, used inside detail drawers. */
export function DrawerSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label/value grid used for the "profile" block at the top of a drawer. */
export function DetailItems({
  title,
  items,
}: {
  title: string;
  items: Array<[label: string, value: ReactNode]>;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <dl className="grid gap-4 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Minimal table for nested/related record lists inside a drawer. */
export function SimpleTable({
  headers,
  align,
  children,
}: {
  headers: string[];
  align?: ("left" | "right")[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            {headers.map((header, i) => (
              <th
                key={header}
                className={cn(
                  "px-3 py-2 font-medium",
                  align?.[i] === "right" && "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
        {text}
      </td>
    </tr>
  );
}

/** Horizontal status stepper (draft → sent → paid, or ...→ overdue). Steps
 * up to `activeIndex` render as done/current; steps after render as pending.
 * `danger` swaps the current-step accent from blue to red (e.g. overdue). */
export function StatusTimeline({
  steps,
  activeIndex,
  danger,
}: {
  steps: string[];
  activeIndex: number;
  danger?: boolean;
}) {
  return (
    <ol className="flex items-center gap-0">
      {steps.map((label, i) => {
        const done = i < activeIndex || (i === activeIndex && !danger);
        const current = i === activeIndex;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                  current && danger
                    ? "bg-red-500/15 text-red-600 ring-2 ring-red-500/40 dark:text-red-400"
                    : done
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {done && !(current && danger) ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  current
                    ? danger
                      ? "font-medium text-red-600 dark:text-red-400"
                      : "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div
                className={cn(
                  "mx-2 h-px flex-1",
                  i < activeIndex ? "bg-blue-500/40" : "bg-border"
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A row-action link styled like the ghost icon buttons in the users module. */
export function IconLink({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
    >
      {children}
    </Link>
  );
}
