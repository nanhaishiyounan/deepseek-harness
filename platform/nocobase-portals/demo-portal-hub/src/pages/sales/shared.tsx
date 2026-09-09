import {
  useGetIdentity,
  useGetLocale,
  useList,
  useTranslate,
} from "@refinedev/core";
import { Check, Copy, Mail, Phone, Users } from "lucide-react";
import {
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { badgeClassFor, scoreBand } from "./constants";
import type { UserRef } from "./types";

export function useLocale(): string {
  const getLocale = useGetLocale();
  return getLocale();
}

export const userLabel = (user: UserRef | null | undefined) =>
  user ? user.nickname || user.username || `User #${user.id}` : "—";

/** Icon for an activity type — shared by the calendar, the timeline and the list. */
export const activityIcon = (type: string | null | undefined) => {
  switch (type) {
    case "email":
      return Mail;
    case "meeting":
      return Users;
    default:
      return Phone;
  }
};

/** The signed-in user, used to scope "my" views and highlight own records. */
export function useCurrentUserId(): string | null {
  const { data } = useGetIdentity<{ id?: string | number }>();
  return data?.id === undefined || data?.id === null ? null : String(data.id);
}

/** Owner facet options, shared by every sales list. */
export function useOwnerOptions() {
  const { result } = useList<UserRef>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "id", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  return useMemo(
    () =>
      result.data.map((user) => ({
        value: String(user.id),
        label: userLabel(user),
      })),
    [result.data]
  );
}

/** Copies the current record's deep link — the "share this record" affordance. */
export function CopyLinkButton({ className }: { className?: string }) {
  const translate = useTranslate();
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={translate(
        "sales.common.copyLink",
        { ns: "starter" },
        "Copy link to this record"
      )}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

/** Compact figure used in drawer headers (open pipeline, won, last touch…). */
export function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger" | "positive";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}

const SCORE_TONE: Record<string, string> = {
  hot: "bg-red-500/15 text-red-700 dark:text-red-300",
  warm: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  cold: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export function ScorePill({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        SCORE_TONE[scoreBand(score)]
      )}
    >
      {score}
    </span>
  );
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
    <td
      colSpan={colSpan}
      className="px-3 py-6 text-center text-muted-foreground"
    >
      {text}
    </td>
  </tr>
);
