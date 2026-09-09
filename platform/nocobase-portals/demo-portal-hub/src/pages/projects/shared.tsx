import { useGetLocale, useTranslate } from "@refinedev/core";
import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { badgeClassFor, labelFor, TASK_PRIORITIES } from "./constants";

export function useLocale(): string {
  const getLocale = useGetLocale();
  return getLocale();
}

export function EnumBadge({
  value,
  label,
}: {
  value: string | null | undefined;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        badgeClassFor(value)
      )}
    >
      {label}
    </span>
  );
}

/** Priority pill with a leading dot — used on task cards and tables. */
export function PriorityPill({ value }: { value: string | null | undefined }) {
  const translate = useTranslate();
  const dot =
    value === "high"
      ? "bg-red-500"
      : value === "med"
        ? "bg-sky-500"
        : "bg-slate-400";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        badgeClassFor(value)
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {labelFor(TASK_PRIORITIES, value, translate)}
    </span>
  );
}

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

export function DrawerSection({
  title,
  action,
  children,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
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

export function SimpleTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
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

export const EmptyRow = ({
  colSpan,
  text,
}: {
  colSpan: number;
  text: string;
}) => (
  <tr>
    <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
      {text}
    </td>
  </tr>
);
