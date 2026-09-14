import { useShow, useTranslate, useUpdate } from "@refinedev/core";
import { CheckCircle2, Circle, Pencil } from "lucide-react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { formatDate, todayIso } from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import { DetailItems, EnumBadge, useLocale } from "../shared";
import type { MilestoneRecord } from "../types";
import { milestoneTransitionValues } from "../transitions";

export function MilestoneShow() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const { mutate: updateMilestone } = useUpdate<MilestoneRecord>();
  const { result: record, query } = useShow<MilestoneRecord>({
    resource: "hub_pj_milestones",
    id,
    meta: { appends: ["project"] },
  });

  const isDone = Boolean(record?.done);
  const isOverdue = !isDone && (record?.due_date ?? "") < todayIso();
  const displayName =
    record?.name ||
    translate("projects.milestones.show.title.untitled", { ns: "starter" }, "Untitled milestone");

  return (
    <RouteDrawer
      title={
        query.isLoading && !record ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          displayName
        )
      }
      description={translate(
        "projects.milestones.show.desc",
        { ns: "starter" },
        "Milestone details."
      )}
      closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <EditButton
            resource="hub_pj_milestones"
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
              {translate(
                "projects.milestones.show.error.title",
                { ns: "starter" },
                "Unable to load milestone"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "projects.milestones.show.error.desc",
                { ns: "starter" },
                "The milestone may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("projects.milestones.show.overview", { ns: "starter" }, "Overview")}
              items={[
                [
                  translate("projects.milestones.columns.project", { ns: "starter" }, "Project"),
                  record?.project?.name || "—",
                ],
                [
                  translate("projects.milestones.columns.target", { ns: "starter" }, "Target"),
                  <span
                    key="due"
                    className={isOverdue ? "text-red-600 dark:text-red-400" : undefined}
                  >
                    {formatDate(record?.due_date, locale)}
                  </span>,
                ],
                [
                  translate("projects.milestones.columns.status", { ns: "starter" }, "Status"),
                  isDone ? (
                    <EnumBadge
                      key="status"
                      value="done"
                      label={translate(
                        "projects.milestones.status.completed",
                        { ns: "starter" },
                        "Completed"
                      )}
                    />
                  ) : (
                    <EnumBadge
                      key="status"
                      value="planning"
                      label={translate(
                        "projects.milestones.status.pending",
                        { ns: "starter" },
                        "Pending"
                      )}
                    />
                  ),
                ],
              ]}
            />
            {record ? (
              <Button
                variant={isDone ? "outline" : "default"}
                size="sm"
                onClick={() =>
                  updateMilestone({
                    resource: "hub_pj_milestones",
                    id: record.id,
                    values: milestoneTransitionValues(!isDone, record),
                  })
                }
              >
                {isDone ? <Circle /> : <CheckCircle2 />}
                {isDone
                  ? translate(
                      "projects.milestones.markPending",
                      { ns: "starter" },
                      "Mark pending"
                    )
                  : translate(
                      "projects.milestones.markCompleted",
                      { ns: "starter" },
                      "Mark completed"
                    )}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}
