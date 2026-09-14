import { useShow, useTranslate } from "@refinedev/core";
import { Check, Pencil, X } from "lucide-react";
import { useOutlet, useParams } from "react-router";

import { EditButton } from "@/components/resources/buttons/edit";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, lookup, optionLabel } from "../constants";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { DetailItems, fmtDate, money, Pill } from "../shared";
import type { Expense } from "../types";

const RESOURCE = "hub_fin_expenses";

function employeeName(exp: Expense | undefined): string {
  return exp?.employee?.nickname || exp?.employee?.username || exp?.employee?.email || "—";
}

export function ExpenseShow() {
  const t = useTranslate();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const { result: record, query } = useShow<Expense>({
    resource: RESOURCE,
    id,
    meta: { appends: ["employee"] },
  });

  const pending = record?.status === "pending";
  const categoryOpt = lookup(EXPENSE_CATEGORIES, record?.category);
  const statusOpt = lookup(EXPENSE_STATUSES, record?.status);
  const displayName = record?.title || t("finance.expenses.detail.unnamed", "Expense claim");

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? <Skeleton className="h-6 w-40" /> : displayName
      }
      description={t(
        "finance.expenses.drawer.show.desc",
        "Claim details and approval status."
      )}
      closeLabel={t("finance.common.close", "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <EditButton
            resource={RESOURCE}
            recordItemId={record.id}
            variant="outline"
            size="icon-sm"
            onClick={() => openChild("edit")}
          >
            <Pencil />
          </EditButton>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {t("finance.expenses.detail.loadError.title", "Unable to load expense")}
            </AlertTitle>
            <AlertDescription>
              {t(
                "finance.expenses.detail.loadError.desc",
                "The claim may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {pending ? (
              <div className="flex flex-col gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {t(
                    "finance.expenses.detail.pendingNotice",
                    "This claim is awaiting a decision."
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => openChild("decision/approve")}
                  >
                    <Check />
                    {t("finance.expenses.action.approve", "Approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-600 hover:bg-red-500/12 hover:text-red-700 dark:text-red-400"
                    onClick={() => openChild("decision/reject")}
                  >
                    <X />
                    {t("finance.expenses.action.reject", "Reject")}
                  </Button>
                </div>
              </div>
            ) : null}
            <DetailItems
              title={t("finance.expenses.detail.profile", "Claim")}
              items={[
                [t("finance.expenses.field.employee", "Employee"), employeeName(record)],
                [
                  t("finance.expenses.field.category", "Category"),
                  <Pill key="cat" option={categoryOpt} label={optionLabel(categoryOpt, t)} />,
                ],
                [
                  t("finance.expenses.field.status", "Status"),
                  <Pill key="status" option={statusOpt} label={optionLabel(statusOpt, t)} />,
                ],
                [t("finance.expenses.field.spentAt", "Spent at"), fmtDate(record?.spent_at)],
                [
                  t("finance.expenses.field.amount", "Amount"),
                  <span key="amount" className="tabular-nums">
                    {money(record?.amount, true)}
                  </span>,
                ],
              ]}
            />
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}
