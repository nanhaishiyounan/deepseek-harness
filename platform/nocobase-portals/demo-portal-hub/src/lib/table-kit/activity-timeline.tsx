import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ActivityEntry = {
  id: string;
  at?: string | null;
  actor?: string | null;
  title: string;
  detail?: ReactNode;
  tone?: string;
};

export function ActivityTimeline({
  entries,
  locale,
  emptyText,
}: {
  entries: ActivityEntry[];
  locale: string;
  emptyText: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  const format = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";

  return (
    <ol className="relative space-y-4 border-l border-border/70 pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className={cn(
              "absolute top-1 -left-[1.4rem] size-2.5 rounded-full ring-4 ring-background",
              entry.tone ?? "bg-primary"
            )}
          />
          <p className="text-sm font-medium">{entry.title}</p>
          {entry.detail ? (
            <div className="mt-0.5 text-sm text-muted-foreground">
              {entry.detail}
            </div>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {format(entry.at)}
            {entry.actor ? ` · ${entry.actor}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
