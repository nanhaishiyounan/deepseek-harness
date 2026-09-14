import { useGetLocale } from "@refinedev/core";
import { Star } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { badgeClassFor } from "./constants";

export function useLocale(): string {
  const getLocale = useGetLocale();
  return getLocale() || "en-US";
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

/** Compact 1–5 star rating display. */
export function RatingStars({ value }: { value: number | null | undefined }) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value ?? 0))));
  if (!rating) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating}/5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-3.5",
            index < rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          )}
        />
      ))}
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
