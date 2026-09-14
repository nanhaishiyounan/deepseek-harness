import { useShow, useTranslate, useUpdate } from "@refinedev/core";
import { Check, X } from "lucide-react";
import { useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import { RouteDrawer, RouteDrawerFooter } from "@/extensions/nocobase-route-surfaces";
import { useContextualCloseTo } from "../route-surfaces";
import { money } from "../shared";
import type { Expense } from "../types";

const RESOURCE = "hub_fin_expenses";

/** Nested (2nd-level) drawer opened from the expense detail: confirms an
 * approve or reject decision and writes the status back. `action` comes
 * from the route path — /expenses/show/:id/decision/:action. */
export function ExpenseDecision() {
  const t = useTranslate();
  const { id, action } = useParams<{ id: string; action: string }>();
  const closeTo = useContextualCloseTo();
  const close = useRouteSurfaceClose();
  const approve = action === "approve";

  const { result: record, query } = useShow<Expense>({
    resource: RESOURCE,
    id,
    meta: { appends: ["employee"] },
  });
  const { mutate, mutation } = useUpdate();

  const title = approve
    ? t("finance.expenses.decision.approveTitle", "Approve expense")
    : t("finance.expenses.decision.rejectTitle", "Reject expense");
  const description = approve
    ? t(
        "finance.expenses.decision.approveDesc",
        "This marks the claim approved and clears it for reimbursement."
      )
    : t(
        "finance.expenses.decision.rejectDesc",
        "This marks the claim rejected. The employee can resubmit if needed."
      );

  const confirm = () =>
    mutate(
      {
        resource: RESOURCE,
        id,
        values: { status: approve ? "approved" : "rejected" },
        successNotification: {
          type: "success",
          message: approve
            ? t("finance.expenses.notify.approved", "Expense approved")
            : t("finance.expenses.notify.rejected", "Expense rejected"),
        },
      },
      { onSuccess: () => close({ skipBeforeClose: true }) }
    );

  return (
    <RouteDrawer
      title={query.isLoading && !record ? <Skeleton className="h-6 w-40" /> : title}
      description={description}
      closeLabel={t("finance.common.close", "Close")}
      closeTo={closeTo}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {record ? (
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-sm font-medium">{record.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {record.employee?.nickname || record.employee?.username || "—"} ·{" "}
              <span className="tabular-nums">{money(record.amount, true)}</span>
            </p>
          </div>
        ) : null}
      </div>
      <RouteDrawerFooter className="flex-row justify-end">
        <Button type="button" variant="outline" onClick={() => close()}>
          {t("finance.common.cancel", "Cancel")}
        </Button>
        <Button
          type="button"
          disabled={mutation.isPending}
          className={
            approve
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }
          onClick={confirm}
        >
          {approve ? <Check /> : <X />}
          {mutation.isPending
            ? t("finance.common.saving", "Saving…")
            : approve
              ? t("finance.expenses.action.approve", "Approve")
              : t("finance.expenses.action.reject", "Reject")}
        </Button>
      </RouteDrawerFooter>
    </RouteDrawer>
  );
}
