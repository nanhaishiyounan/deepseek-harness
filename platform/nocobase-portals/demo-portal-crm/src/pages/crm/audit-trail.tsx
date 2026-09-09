import { useTranslate } from "@refinedev/core";
import { Check, Clock, Copy, History } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "./constants";
import { DrawerSection } from "./shared";
import type { AuditableRecord } from "./types";

/**
 * "System information" panel. Every NocoBase collection stamps who created and
 * last changed a record; surfacing it is what separates a real record page from
 * a form dump, and it is the first thing an admin looks for when data is wrong.
 */
export function AuditTrail({
  record,
  locale,
}: {
  record: AuditableRecord | undefined;
  locale: string;
}) {
  const translate = useTranslate();
  if (!record) return null;

  const rows: Array<[string, string]> = [
    [
      translate("crm.audit.createdBy", { ns: "starter" }, "Created by"),
      record.createdBy?.nickname || "—",
    ],
    [
      translate("crm.audit.createdAt", { ns: "starter" }, "Created at"),
      formatDateTime(record.createdAt, locale),
    ],
    [
      translate("crm.audit.updatedBy", { ns: "starter" }, "Last modified by"),
      record.updatedBy?.nickname || "—",
    ],
    [
      translate("crm.audit.updatedAt", { ns: "starter" }, "Last modified at"),
      formatDateTime(record.updatedAt, locale),
    ],
    [
      translate("crm.audit.recordId", { ns: "starter" }, "Record ID"),
      String(record.id ?? "—"),
    ],
  ];

  return (
    <DrawerSection
      title={translate("crm.audit.title", { ns: "starter" }, "System information")}
      action={<History className="size-4 text-muted-foreground" />}
    >
      <dl className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </DrawerSection>
  );
}

/** Relative "3 days ago" label used next to timestamps on record headers. */
export function RelativeTime({ value }: { value: string | null | undefined }) {
  const translate = useTranslate();
  if (!value) return null;
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return null;
  const label =
    days <= 0
      ? translate("crm.time.today", { ns: "starter" }, "today")
      : days === 1
        ? translate("crm.time.yesterday", { ns: "starter" }, "yesterday")
        : translate(
            "crm.time.daysAgo",
            { ns: "starter", count: days },
            `${days} days ago`
          );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3" />
      {label}
    </span>
  );
}

/** Copies the current record URL — the "share this record" affordance. */
export function CopyLinkButton() {
  const translate = useTranslate();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={translate("crm.common.copyLink", { ns: "starter" }, "Copy record link")}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check /> : <Copy />}
      <span className="sr-only">
        {translate("crm.common.copyLink", { ns: "starter" }, "Copy record link")}
      </span>
    </Button>
  );
}
