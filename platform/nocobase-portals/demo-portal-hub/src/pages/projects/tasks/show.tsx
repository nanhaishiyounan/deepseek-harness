import { useList, useShow, useTranslate, useUpdate } from "@refinedev/core";
import { CheckSquare, Pencil, Plus, Square, Trash2 } from "lucide-react";
import { useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  TASK_STATUSES,
  formatDate,
  labelFor,
  todayIso,
  userLabel,
} from "../constants";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  DetailItems,
  DrawerSection,
  EmptyRow,
  PriorityPill,
  SimpleTable,
  useLocale,
} from "../shared";
import type { ChecklistRecord, TaskRecord } from "../types";
import { taskTransitionValues } from "../transitions";

export function TaskShow() {
  const locale = useLocale();
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nested = useOutlet();
  const { mutate: updateTask } = useUpdate<TaskRecord>();
  const { result: record, query } = useShow<TaskRecord>({
    resource: "hub_pj_tasks",
    id,
    meta: { appends: ["project", "assignee"] },
  });

  const isOverdue =
    record?.status !== "done" &&
    Boolean(record?.due_date) &&
    (record?.due_date as string) < todayIso();

  const displayName =
    record?.title ||
    translate("projects.tasks.show.title.untitled", { ns: "starter" }, "Untitled task");

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
        "projects.tasks.show.desc",
        { ns: "starter" },
        "Task details and checklist."
      )}
      closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nested}
      actions={
        record ? (
          <EditButton
            resource="hub_pj_tasks"
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
                "projects.tasks.show.error.title",
                { ns: "starter" },
                "Unable to load task"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "projects.tasks.show.error.desc",
                { ns: "starter" },
                "The task may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <DetailItems
              title={translate("projects.tasks.show.overview", { ns: "starter" }, "Overview")}
              items={[
                [
                  translate("projects.tasks.fields.status", { ns: "starter" }, "Status"),
                  record ? (
                    <Select
                      key="status"
                      value={record.status ?? "todo"}
                      onValueChange={(value) =>
                        updateTask({
                          resource: "hub_pj_tasks",
                          id: record.id,
                          values: taskTransitionValues(value ?? "todo", record),
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue>
                          {labelFor(TASK_STATUSES, record.status ?? "todo", translate)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {translate(status.i18nKey, { ns: "starter" }, status.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate("projects.tasks.fields.priority", { ns: "starter" }, "Priority"),
                  <PriorityPill key="priority" value={record?.priority} />,
                ],
                [
                  translate("projects.tasks.fields.project", { ns: "starter" }, "Project"),
                  record?.project?.name || "—",
                ],
                [
                  translate("projects.tasks.fields.assignee", { ns: "starter" }, "Assignee"),
                  userLabel(record?.assignee),
                ],
                [
                  translate("projects.tasks.fields.dueDate", { ns: "starter" }, "Due date"),
                  <span
                    key="due"
                    className={isOverdue ? "text-red-600 dark:text-red-400" : undefined}
                  >
                    {formatDate(record?.due_date, locale)}
                  </span>,
                ],
              ]}
            />
            {id ? (
              <>
                <Separator />
                <ChecklistSection taskId={id} openChild={openChild} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

type OpenChild = (to: string) => void;

function ChecklistSection({
  taskId,
  openChild,
}: {
  taskId: string;
  openChild: OpenChild;
}) {
  const translate = useTranslate();
  const { mutate: updateItem } = useUpdate<ChecklistRecord>();
  const { result } = useList<ChecklistRecord>({
    resource: "hub_pj_checklist",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "createdAt", order: "asc" }],
    filters: [
      { field: "hub_pj_checklist_task_id", operator: "eq", value: taskId },
    ],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const total = result.data.length;
  const done = result.data.filter((item) => item.done).length;

  return (
    <DrawerSection
      title={translate(
        "projects.tasks.show.checklist",
        { ns: "starter", done, total },
        `Checklist (${done}/${total})`
      )}
      action={
        <Button variant="outline" size="sm" onClick={() => openChild("checklist/create")}>
          <Plus />
          {translate("projects.tasks.checklist.add", { ns: "starter" }, "Add item")}
        </Button>
      }
    >
      <SimpleTable
        headers={[
          translate("projects.tasks.checklist.item", { ns: "starter" }, "Item"),
          translate("projects.common.actions", { ns: "starter" }, "Actions"),
        ]}
      >
        {result.data.length === 0 ? (
          <EmptyRow
            colSpan={2}
            text={translate(
              "projects.tasks.checklist.empty",
              { ns: "starter" },
              "No checklist items yet."
            )}
          />
        ) : (
          result.data.map((item) => (
            <tr key={String(item.id)}>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    updateItem({
                      resource: "hub_pj_checklist",
                      id: item.id,
                      values: { done: !item.done },
                    })
                  }
                  className="flex items-center gap-2 text-left"
                >
                  {item.done ? (
                    <CheckSquare className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Square className="size-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span
                    className={
                      item.done
                        ? "text-muted-foreground line-through"
                        : "font-medium"
                    }
                  >
                    {item.title || "—"}
                  </span>
                </button>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      openChild(
                        `checklist/edit/${encodeURIComponent(String(item.id))}`
                      )
                    }
                  >
                    <Pencil />
                  </Button>
                  <DeleteButton
                    resource="hub_pj_checklist"
                    recordItemId={item.id}
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                  </DeleteButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </SimpleTable>
    </DrawerSection>
  );
}
