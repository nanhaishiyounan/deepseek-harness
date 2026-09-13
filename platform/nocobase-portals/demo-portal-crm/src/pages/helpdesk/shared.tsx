import { useTranslate } from "@refinedev/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  categoryClassFor,
  initialsFor,
  priorityClassFor,
  priorityDotFor,
  statusClassFor,
} from "./constants";
import type { UserRef } from "./types";

type Translate = ReturnType<typeof useTranslate>;

export function StatusPill({
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
        statusClassFor(value)
      )}
    >
      {label}
    </span>
  );
}

export function CategoryBadge({
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
        categoryClassFor(value)
      )}
    >
      {label}
    </span>
  );
}

export function PriorityPill({
  value,
  label,
}: {
  value: string | null | undefined;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        priorityClassFor(value)
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", priorityDotFor(value))}
      />
      {label}
    </span>
  );
}

export function userLabel(
  user: UserRef | null | undefined,
  translate?: Translate
): string {
  const unassigned = translate
    ? translate("helpdesk.common.unassigned", { ns: "starter" }, "Unassigned")
    : "Unassigned";
  return user?.nickname || user?.username || user?.email || unassigned;
}

export function UserChip({ user }: { user: UserRef | null | undefined }) {
  const translate = useTranslate();
  const label = userLabel(user, translate);
  const assigned = Boolean(user);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
          assigned
            ? "bg-primary/12 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {assigned ? initialsFor(label) : "–"}
      </span>
      <span
        className={cn(
          "truncate text-xs",
          assigned ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
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
