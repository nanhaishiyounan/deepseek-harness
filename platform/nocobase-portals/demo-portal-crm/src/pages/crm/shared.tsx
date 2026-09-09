import { useGetLocale } from "@refinedev/core";
import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { badgeClassFor } from "./constants";

export function useLocale(): string {
  const getLocale = useGetLocale();
  return getLocale();
}

/**
 * Width preset for detail drawers.
 *
 * RouteDrawer defaults to `lg:w-[42vw] lg:min-w-[40rem]`, which suits a
 * single-column form but is too narrow for a detail view: tabs, KPI cards and
 * two-column definition lists all get squeezed into vertical slivers. Passing
 * this through `className` wins over the default because `cn()` runs
 * tailwind-merge, which keeps the shared RouteDrawer file untouched.
 *
 * Use on detail/show drawers. Leave create/edit forms at the default width.
 */
export const DRAWER_WIDE =
  "lg:w-[min(62vw,100%)] lg:min-w-[min(56rem,100%)] 2xl:max-w-[100rem]";

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
