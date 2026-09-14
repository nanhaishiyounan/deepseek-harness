import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, CalendarClock, Clock, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import { INVOICE_STATUSES, lookup, optionLabel } from "./constants";
import { AsyncPanel, KpiStrip, exportCsv, type KpiTile } from "@/lib/table-kit";
import { useOpenContextualChild } from "./route-surfaces";
import { fmtDate, money, PageHeader, Pill } from "./shared";
import type { Invoice } from "./types";
import {
  invoiceAmount,
  invoiceDisplayStatus,
  useInvoiceAmounts,
} from "./invoice-metrics";

const RESOURCE = "hub_fin_invoices";

// Standard AR ageing ladder. `draft` is excluded because nothing has been
// issued to the client yet, so it is not receivable.
const BUCKETS = [
  { id: "current", i18nKey: "finance.aging.bucket.current", label: "Not yet due", min: -Infinity, max: 0 },
  { id: "b1", i18nKey: "finance.aging.bucket.b1", label: "1–30 days", min: 1, max: 30 },
  { id: "b2", i18nKey: "finance.aging.bucket.b2", label: "31–60 days", min: 31, max: 60 },
  { id: "b3", i18nKey: "finance.aging.bucket.b3", label: "61–90 days", min: 61, max: 90 },
  { id: "b4", i18nKey: "finance.aging.bucket.b4", label: "90+ days", min: 91, max: Infinity },
] as const;

type BucketId = (typeof BUCKETS)[number]["id"];

const daysPastDue = (invoice: Invoice) => {
  if (!invoice.due_date) return 0;
  const due = new Date(invoice.due_date).getTime();
  if (Number.isNaN(due)) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due) / (1000 * 60 * 60 * 24));
};

const bucketFor = (days: number): BucketId => {
  for (const bucket of BUCKETS) {
    if (days >= bucket.min && days <= bucket.max) return bucket.id;
  }
  return "current";
};

/**
 * Accounts-receivable ageing: how much is owed, how late it is, and who to
 * chase first. Receivable = every issued invoice that is not yet paid.
 */
export function ArAging() {
  const t = useTranslate();
  const chart = useChartTheme();
  const openChild = useOpenContextualChild();
  const notify = useNotification();
  const { mutateAsync: updateInvoice } = useUpdate<Invoice>();
  const invoiceAmounts = useInvoiceAmounts();
  const [selectedBucket, setSelectedBucket] = useState<BucketId | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const { result, query } = useList<Invoice>({
    resource: RESOURCE,
    pagination: { mode: "off" },
    sorters: [{ field: "due_date", order: "asc" }],
  });

  const analysis = useMemo(() => {
    const receivable = (result?.data ?? [])
      .filter((invoice) => invoice.status !== "paid" && invoice.status !== "draft")
      .map((invoice) => {
        const days = daysPastDue(invoice);
        return { invoice, days, bucket: bucketFor(days) };
      });

    const byBucket = new Map<BucketId, { amount: number; count: number }>();
    const byClient = new Map<string, { amount: number; overdue: number }>();
    for (const row of receivable) {
      const amount = invoiceAmount(row.invoice, invoiceAmounts.byInvoice);
      const bucket = byBucket.get(row.bucket) ?? { amount: 0, count: 0 };
      bucket.amount += amount;
      bucket.count += 1;
      byBucket.set(row.bucket, bucket);

      const client = row.invoice.client_name || "—";
      const entry = byClient.get(client) ?? { amount: 0, overdue: 0 };
      entry.amount += amount;
      if (row.days > 0) entry.overdue += amount;
      byClient.set(client, entry);
    }

    const total = receivable.reduce(
      (sum, row) => sum + invoiceAmount(row.invoice, invoiceAmounts.byInvoice),
      0
    );
    const overdueRows = receivable.filter((row) => row.days > 0);
    const overdue = overdueRows.reduce(
      (sum, row) => sum + invoiceAmount(row.invoice, invoiceAmounts.byInvoice),
      0
    );
    // Weighted average days-late — the single number a controller quotes.
    const weightedDays =
      total > 0
        ? receivable.reduce(
            (sum, row) =>
              sum +
              Math.max(0, row.days) *
                invoiceAmount(row.invoice, invoiceAmounts.byInvoice),
            0
          ) / total
        : 0;

    return {
      receivable,
      byBucket,
      total,
      overdue,
      overdueCount: overdueRows.length,
      weightedDays,
      topClients: [...byClient.entries()]
        .map(([client, entry]) => ({ client, ...entry }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8),
    };
  }, [invoiceAmounts.byInvoice, result?.data]);

  const worklist = useMemo(() => {
    const rows = selectedBucket
      ? analysis.receivable.filter((row) => row.bucket === selectedBucket)
      : analysis.receivable;
    return [...rows].sort((a, b) => b.days - a.days);
  }, [analysis.receivable, selectedBucket]);

  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "ar",
        label: t("finance.aging.kpi.total", "Total receivable"),
        value: money(analysis.total),
        hint: t("finance.aging.kpi.total.hint", "Issued and not yet paid"),
        icon: Wallet,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "overdue",
        label: t("finance.aging.kpi.overdue", "Past due"),
        value: money(analysis.overdue),
        hint: t("finance.aging.kpi.overdue.hint", "{{count}} invoices past their due date").replace(
          "{{count}}",
          String(analysis.overdueCount)
        ),
        icon: AlertTriangle,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      },
      {
        key: "dso",
        label: t("finance.aging.kpi.avgDays", "Average days late"),
        value: analysis.weightedDays.toFixed(0),
        hint: t("finance.aging.kpi.avgDays.hint", "Weighted by invoice value"),
        icon: Clock,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
      {
        key: "worst",
        label: t("finance.aging.kpi.worst", "Over 90 days"),
        value: money(analysis.byBucket.get("b4")?.amount ?? 0),
        hint: t("finance.aging.kpi.worst.hint", "At real risk of write-off"),
        icon: CalendarClock,
        tone: "text-rose-600 bg-rose-500/12 dark:text-rose-400",
        onClick: () => setSelectedBucket((previous) => (previous === "b4" ? null : "b4")),
        active: selectedBucket === "b4",
      },
    ],
    [analysis, selectedBucket, t]
  );

  const axisBase = {
    axisLine: { lineStyle: { color: chart.grid } },
    axisTick: { show: false },
    axisLabel: { color: chart.axis, fontSize: 12 },
  };
  const tooltipBase = {
    backgroundColor: chart.tooltipBg,
    borderColor: chart.tooltipBorder,
    textStyle: { color: chart.tooltipText, fontSize: 12 },
    borderWidth: 1,
    padding: [8, 12] as [number, number],
  };

  const bucketOption = {
    color: chart.palette,
    grid: { left: 6, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
    xAxis: {
      type: "category",
      data: BUCKETS.map((bucket) => t(bucket.i18nKey, bucket.label)),
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        name: t("finance.aging.series.amount", "Receivable"),
        type: "bar",
        barWidth: 34,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: BUCKETS.map((bucket) => ({
          value: Math.round(analysis.byBucket.get(bucket.id)?.amount ?? 0),
          bucketId: bucket.id,
        })),
      },
    ],
  };

  const markPaid = async (invoice: Invoice) => {
    setIsBusy(true);
    try {
      await updateInvoice({
        resource: RESOURCE,
        id: invoice.id,
        values: { status: "paid" },
        successNotification: false,
      });
      notify.open?.({
        type: "success",
        message: t("finance.aging.markedPaid", "Invoice marked paid"),
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("finance.aging.title", "AR aging")}
        description={t(
          "finance.aging.subtitle",
          "How much clients owe, how late it is, and who to chase first."
        )}
      />

      <AsyncPanel i18nPrefix="finance.ops"
        isLoading={query.isLoading || invoiceAmounts.isLoading}
        isError={query.isError || invoiceAmounts.isError}
        isEmpty={!query.isLoading && analysis.receivable.length === 0}
        onRetry={() => {
          void query.refetch();
          void invoiceAmounts.refetch();
        }}
        emptyTitle={t("finance.aging.empty.title", "Nothing outstanding")}
        emptyDescription={t(
          "finance.aging.empty.description",
          "Every issued invoice has been paid."
        )}
        skeletonRows={6}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t("finance.aging.chart.title", "Aging buckets")}</CardTitle>
                <CardDescription>
                  {t(
                    "finance.aging.chart.desc",
                    "Receivable value by how far past due it is. Click a bar to filter the worklist."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`aging-${chart.isDark}`}
                  option={bucketOption}
                  style={{ height: 260 }}
                  opts={{ renderer: "svg" }}
                  onEvents={{
                    click: (params: { data?: { bucketId?: BucketId } }) => {
                      const id = params.data?.bucketId;
                      if (id) {
                        setSelectedBucket((previous) => (previous === id ? null : id));
                      }
                    },
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("finance.aging.clients.title", "Top exposure")}</CardTitle>
                <CardDescription>
                  {t("finance.aging.clients.desc", "Clients holding the most of your cash.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.topClients.map((entry) => (
                    <div key={entry.client} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{entry.client}</span>
                        <span className="tabular-nums">{money(entry.amount)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            entry.overdue > 0 ? "bg-red-500/70" : "bg-primary/70"
                          )}
                          style={{
                            width: `${
                              analysis.topClients[0]?.amount
                                ? (entry.amount / analysis.topClients[0].amount) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {t("finance.aging.worklist.title", "Collections worklist")}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      "finance.aging.worklist.desc",
                      "Oldest debt first. Chase from the top."
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {BUCKETS.map((bucket) => (
                    <button
                      key={bucket.id}
                      type="button"
                      onClick={() =>
                        setSelectedBucket((previous) =>
                          previous === bucket.id ? null : bucket.id
                        )
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selectedBucket === bucket.id
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/70 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {t(bucket.i18nKey, bucket.label)}
                      <span className="ml-1 tabular-nums">
                        {analysis.byBucket.get(bucket.id)?.count ?? 0}
                      </span>
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      exportCsv(
                        "ar-aging",
                        [
                          { header: "Invoice", value: (row: (typeof worklist)[number]) => row.invoice.invoice_number },
                          { header: "Client", value: (row) => row.invoice.client_name },
                          {
                            header: "Amount",
                            value: (row) =>
                              invoiceAmount(row.invoice, invoiceAmounts.byInvoice),
                          },
                          { header: "Issued", value: (row) => row.invoice.issue_date },
                          { header: "Due", value: (row) => row.invoice.due_date },
                          { header: "Days past due", value: (row) => row.days },
                          { header: "Status", value: (row) => row.invoice.status },
                        ],
                        worklist
                      )
                    }
                  >
                    {t("finance.ops.exportCsv", "Export CSV")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("finance.invoices.col.number", "Invoice #")}</TableHead>
                      <TableHead>{t("finance.invoices.col.client", "Client")}</TableHead>
                      <TableHead className="text-right">
                        {t("finance.invoices.col.amount", "Amount")}
                      </TableHead>
                      <TableHead>{t("finance.invoices.col.due", "Due")}</TableHead>
                      <TableHead className="text-right">
                        {t("finance.aging.col.daysLate", "Days late")}
                      </TableHead>
                      <TableHead>{t("finance.invoices.col.status", "Status")}</TableHead>
                      <TableHead className="text-right">
                        {t("finance.common.actions", "Actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {worklist.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-10 text-center text-muted-foreground"
                        >
                          {t("finance.aging.worklist.empty", "Nothing in this bucket.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      worklist.map(({ invoice, days }) => {
                        const option = lookup(
                          INVOICE_STATUSES,
                          invoiceDisplayStatus(invoice)
                        );
                        return (
                          <TableRow
                            key={invoice.id}
                            className={cn(days > 60 && "bg-red-500/[0.06]")}
                          >
                            <TableCell
                              role="button"
                              tabIndex={0}
                              className="cursor-pointer font-medium tabular-nums text-primary underline-offset-2 hover:underline"
                              onClick={() => openChild(`../invoices/show/${invoice.id}`)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openChild(`../invoices/show/${invoice.id}`);
                                }
                              }}
                            >
                              {invoice.invoice_number}
                            </TableCell>
                            <TableCell>{invoice.client_name || "—"}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {money(
                                invoiceAmount(invoice, invoiceAmounts.byInvoice),
                                true
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {fmtDate(invoice.due_date)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right tabular-nums",
                                days > 0
                                  ? "font-medium text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              {days > 0 ? days : "—"}
                            </TableCell>
                            <TableCell>
                              <Pill option={option} label={optionLabel(option, t)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void markPaid(invoice)}
                              >
                                {t("finance.aging.markPaid", "Mark paid")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </AsyncPanel>
    </div>
  );
}
