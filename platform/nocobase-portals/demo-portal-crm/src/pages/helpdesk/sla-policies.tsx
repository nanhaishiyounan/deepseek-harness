import {
  type HttpError,
  useList,
  useShow,
  useTranslate,
} from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import {
  Check,
  ClipboardList,
  Download,
  Plus,
  Save,
  ShieldCheck,
  Tickets,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo } from "react";
import { Link, Outlet, useParams } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { TICKET_PRIORITIES, labelFor } from "./constants";
import { KpiStrip, exportCsv, type KpiTile } from "@/lib/table-kit";
import { getSlaPolicyShowPath, helpdeskRoutes } from "./routes";
import { slaStateFor } from "./sla";
import { PriorityPill } from "./shared";
import type {
  SlaPolicyFormValues,
  SlaPolicyRecord,
  TicketRecord,
} from "./types";

const RESOURCE = "hub_hd_sla_policies";
const TICKETS_RESOURCE = "hub_hd_tickets";

// ---------------------------------------------------------------------------
// SLA policies — a plain table (no board here, unlike tickets: a policy
// list is inherently flat) with a URL-addressable detail/edit drawer that
// opens on row click. Editing saves in place, no nested route needed since
// there is only one editable surface per policy.
// ---------------------------------------------------------------------------

export function SlaPoliciesLayout() {
  return (
    <>
      <SlaPoliciesPage />
      <Outlet />
    </>
  );
}

function minutesLabel(
  mins: number | null | undefined,
  translate: ReturnType<typeof useTranslate>
) {
  if (mins === null || mins === undefined) return "—";
  if (mins % 60 === 0 && mins >= 60) {
    const hrs = mins / 60;
    return translate("helpdesk.sla.hours", { ns: "starter", count: hrs }, `${hrs}h`);
  }
  return translate("helpdesk.sla.minutes", { ns: "starter", count: mins }, `${mins}m`);
}

function SlaPoliciesPage() {
  const translate = useTranslate();

  const { result, query } = useList<SlaPolicyRecord>({
    resource: RESOURCE,
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "id", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { result: ticketsResult, query: ticketsQuery } = useList<TicketRecord>({
    resource: TICKETS_RESOURCE,
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const policies = useMemo(() => result.data ?? [], [result.data]);
  const tickets = useMemo(() => ticketsResult.data ?? [], [ticketsResult.data]);

  const compliance = useMemo(() => {
    const byPriority = new Map<string, SlaPolicyRecord>();
    for (const policy of policies) {
      if (policy.priority) byPriority.set(policy.priority, policy);
    }

    const byPolicy = new Map<
      number | string,
      { tickets: number; breached: number; attainment: number }
    >();
    for (const policy of policies) {
      const matchingTickets = tickets.filter(
        (ticket) => ticket.priority === policy.priority
      );
      const policyMap = new Map<string, SlaPolicyRecord>();
      if (policy.priority) policyMap.set(policy.priority, policy);
      const breached = matchingTickets.filter(
        (ticket) => slaStateFor(ticket, policyMap)?.isBreached
      ).length;
      const attainment = matchingTickets.length
        ? ((matchingTickets.length - breached) / matchingTickets.length) * 100
        : 100;
      byPolicy.set(policy.id, {
        tickets: matchingTickets.length,
        breached,
        attainment,
      });
    }

    const coveredTickets = tickets.filter((ticket) =>
      byPriority.has(ticket.priority ?? "")
    );
    const breached = coveredTickets.filter(
      (ticket) => slaStateFor(ticket, byPriority)?.isBreached
    ).length;
    const attainment = coveredTickets.length
      ? ((coveredTickets.length - breached) / coveredTickets.length) * 100
      : 100;
    const uncoveredPriorities = TICKET_PRIORITIES.map((option) => option.value).filter(
      (priority) =>
        tickets.some((ticket) => ticket.priority === priority) &&
        !byPriority.has(priority)
    );

    return {
      byPolicy,
      coveredTickets: coveredTickets.length,
      breached,
      attainment,
      uncoveredPriorities,
    };
  }, [policies, tickets]);

  const policyRows = useMemo(
    () =>
      policies.map((policy) => ({
        policy,
        metrics: compliance.byPolicy.get(policy.id) ?? {
          tickets: 0,
          breached: 0,
          attainment: 100,
        },
      })),
    [compliance.byPolicy, policies]
  );

  const kpiTiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "policies",
        label: translate("helpdesk.sla.kpi.policies", { ns: "starter" }, "Policies"),
        value: String(policies.length),
        icon: ClipboardList,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "covered",
        label: translate(
          "helpdesk.sla.kpi.covered",
          { ns: "starter" },
          "Tickets covered"
        ),
        value: String(compliance.coveredTickets),
        icon: Tickets,
        tone: "text-violet-600 bg-violet-500/12 dark:text-violet-400",
      },
      {
        key: "attainment",
        label: translate(
          "helpdesk.sla.kpi.attainment",
          { ns: "starter" },
          "Team attainment"
        ),
        value: `${Math.round(compliance.attainment)}%`,
        icon: ShieldCheck,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
      {
        key: "breached",
        label: translate("helpdesk.sla.kpi.breached", { ns: "starter" }, "Breached"),
        value: String(compliance.breached),
        icon: TriangleAlert,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      },
    ],
    [compliance, policies.length, translate]
  );

  const handleExport = () => {
    exportCsv(
      "helpdesk-sla-policies",
      [
        {
          header: translate("helpdesk.sla.export.name", { ns: "starter" }, "Name"),
          value: (row) => row.policy.name,
        },
        {
          header: translate("helpdesk.sla.export.priority", { ns: "starter" }, "Priority"),
          value: (row) => row.policy.priority,
        },
        {
          header: translate(
            "helpdesk.sla.export.response",
            { ns: "starter" },
            "Response target (mins)"
          ),
          value: (row) => row.policy.response_mins,
        },
        {
          header: translate(
            "helpdesk.sla.export.resolve",
            { ns: "starter" },
            "Resolve target (mins)"
          ),
          value: (row) => row.policy.resolve_mins,
        },
        {
          header: translate("helpdesk.sla.columns.tickets", { ns: "starter" }, "Tickets"),
          value: (row) => row.metrics.tickets,
        },
        {
          header: translate("helpdesk.sla.columns.breached", { ns: "starter" }, "Breached"),
          value: (row) => row.metrics.breached,
        },
        {
          header: translate(
            "helpdesk.sla.columns.attainment",
            { ns: "starter" },
            "Attainment %"
          ),
          value: (row) => Number(row.metrics.attainment.toFixed(1)),
        },
      ],
      policyRows
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {translate("helpdesk.sla.title", { ns: "starter" }, "SLA policies")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "helpdesk.sla.subtitle",
                { ns: "starter" },
                "Response and resolution targets for each priority level."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" />
              {translate("helpdesk.ops.exportCsv", { ns: "starter" }, "Export CSV")}
            </Button>
            <Button render={<Link to={helpdeskRoutes.slaPoliciesCreate} />}>
              <Plus className="size-4" />
              {translate("helpdesk.sla.new", { ns: "starter" }, "New policy")}
            </Button>
          </div>
        </div>
      </div>

      <KpiStrip tiles={kpiTiles} />

      {compliance.uncoveredPriorities.length > 0 ? (
        <Alert>
          <AlertTitle>
            {translate(
              "helpdesk.sla.uncovered.title",
              { ns: "starter" },
              "SLA coverage gap"
            )}
          </AlertTitle>
          <AlertDescription>
            {translate(
              "helpdesk.sla.uncovered.description",
              { ns: "starter" },
              "No SLA policy covers: {{priorities}}"
            ).replace("{{priorities}}", compliance.uncoveredPriorities.join(", "))}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {query.isLoading || ticketsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">
                      {translate("helpdesk.sla.columns.name", { ns: "starter" }, "Policy")}
                    </th>
                    <th className="px-4 py-2.5 font-medium">
                      {translate("helpdesk.sla.columns.priority", { ns: "starter" }, "Priority")}
                    </th>
                    <th className="px-4 py-2.5 font-medium">
                      {translate("helpdesk.sla.columns.response", { ns: "starter" }, "Response target")}
                    </th>
                    <th className="px-4 py-2.5 font-medium">
                      {translate("helpdesk.sla.columns.resolve", { ns: "starter" }, "Resolve target")}
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      {translate("helpdesk.sla.columns.tickets", { ns: "starter" }, "Tickets")}
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      {translate("helpdesk.sla.columns.breached", { ns: "starter" }, "Breached")}
                    </th>
                    <th className="px-4 py-2.5 font-medium">
                      {translate(
                        "helpdesk.sla.columns.attainment",
                        { ns: "starter" },
                        "Attainment %"
                      )}
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      {translate("helpdesk.sla.columns.actions", { ns: "starter" }, "Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {policyRows.map(({ policy, metrics }) => (
                    <tr
                      key={policy.id}
                      className={cn(
                        "border-b border-border/50 last:border-0",
                        metrics.breached > 0 && "bg-destructive/5"
                      )}
                    >
                    <td className="px-0 py-0">
                      <Link
                        to={getSlaPolicyShowPath(policy.id)}
                        className="block px-4 py-3 font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {policy.name || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityPill
                        value={policy.priority}
                        label={labelFor(TICKET_PRIORITIES, policy.priority, translate)}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {minutesLabel(policy.response_mins, translate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {minutesLabel(policy.resolve_mins, translate)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {metrics.tickets}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {metrics.breached}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-32 items-center gap-3">
                        <div
                          className="h-1.5 flex-1 rounded-full bg-muted"
                          aria-label={translate(
                            "helpdesk.sla.attainment.label",
                            { ns: "starter" },
                            "SLA attainment"
                          )}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full",
                              metrics.attainment >= 95
                                ? "bg-emerald-500"
                                : metrics.attainment >= 85
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            )}
                            style={{ width: `${metrics.attainment}%` }}
                          />
                        </div>
                        <span className="w-10 text-right tabular-nums">
                          {Math.round(metrics.attainment)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteButton
                        resource={RESOURCE}
                        recordItemId={policy.id}
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 />
                      </DeleteButton>
                    </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail/edit drawer — URL-addressable at /sla-policies/show/:id. Combines
// display + inline edit in one surface since there's a single editable form
// per policy (no need for a separate nested edit route).
// ---------------------------------------------------------------------------

type SlaFormValues = {
  name: string;
  response_mins: number;
  resolve_mins: number;
};

// ---------------------------------------------------------------------------
// Create drawer — URL-addressable at /sla-policies/create. Adds a new policy
// for a priority level (priority is picked here; on the edit surface it is a
// read-only pill since it identifies the policy).
// ---------------------------------------------------------------------------

export function SlaPolicyCreate() {
  const translate = useTranslate();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("helpdesk.sla.create.title", { ns: "starter" }, "New SLA policy")}
        description={translate(
          "helpdesk.sla.create.description",
          { ns: "starter" },
          "Define response and resolution targets for a priority level."
        )}
        closeLabel={translate("buttons.close", "Close")}
        closeTo={helpdeskRoutes.slaPolicies}
        beforeClose={beforeClose}
      >
        <SlaPolicyCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function SlaPolicyCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SlaPolicyRecord, HttpError, SlaPolicyFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      name: "",
      priority: "med",
      response_mins: 60,
      resolve_mins: 480,
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onFinish({
          name: values.name,
          priority: values.priority,
          response_mins: Number(values.response_mins),
          resolve_mins: Number(values.resolve_mins),
        })
      )}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="space-y-2">
          <Label htmlFor="sla-new-name">
            {translate("helpdesk.sla.fields.name", { ns: "starter" }, "Policy name")}
          </Label>
          <Input id="sla-new-name" {...register("name", { required: true })} autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sla-new-priority">
            {translate("helpdesk.sla.fields.priority", { ns: "starter" }, "Priority")}
          </Label>
          <NativeSelect id="sla-new-priority" {...register("priority", { required: true })}>
            {TICKET_PRIORITIES.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {labelFor(TICKET_PRIORITIES, option.value, translate)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sla-new-response">
              {translate("helpdesk.sla.fields.responseMins", { ns: "starter" }, "Response target (minutes)")}
            </Label>
            <Input
              id="sla-new-response"
              type="number"
              min={1}
              {...register("response_mins", { required: true, valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sla-new-resolve">
              {translate("helpdesk.sla.fields.resolveMins", { ns: "starter" }, "Resolve target (minutes)")}
            </Label>
            <Input
              id="sla-new-resolve"
              type="number"
              min={1}
              {...register("resolve_mins", { required: true, valueAsNumber: true })}
            />
          </div>
        </div>
      </div>
      <RouteDrawerFooter className="flex-row justify-end">
        <Button type="button" variant="outline" onClick={() => close()}>
          {translate("buttons.cancel", "Cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? translate("helpdesk.sla.create.submitting", { ns: "starter" }, "Creating...")
            : translate("helpdesk.sla.create.submit", { ns: "starter" }, "Create policy")}
        </Button>
      </RouteDrawerFooter>
    </form>
  );
}

export function SlaPolicyShow() {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();

  const { result: policy, query } = useShow<SlaPolicyRecord>({
    resource: RESOURCE,
    id,
  });

  const {
    refineCore: { onFinish, formLoading },
    register,
    handleSubmit,
    formState: { isSubmitSuccessful },
  } = useForm<SlaPolicyRecord, HttpError, SlaFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      id,
      action: "edit",
      redirect: false,
    },
  });

  const title =
    policy?.name ||
    (query.isLoading ? "" : translate("helpdesk.sla.title", { ns: "starter" }, "SLA policies"));

  return (
    <RouteDrawer
      title={
        query.isLoading && !policy ? <Skeleton className="h-6 w-48" /> : title
      }
      description={translate(
        "helpdesk.sla.show.description",
        { ns: "starter" },
        "Edit the response and resolution targets for this priority."
      )}
      closeLabel={translate("buttons.close", "Close")}
      closeTo={helpdeskRoutes.slaPolicies}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError || !policy ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate("helpdesk.sla.show.errorTitle", { ns: "starter" }, "Unable to load SLA policy")}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "helpdesk.sla.show.errorDescription",
                { ns: "starter" },
                "The policy may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <form
            onSubmit={handleSubmit((values) =>
              onFinish({
                name: values.name,
                response_mins: Number(values.response_mins),
                resolve_mins: Number(values.resolve_mins),
              })
            )}
            className="space-y-5"
          >
            <div className="flex items-center gap-2">
              <PriorityPill
                value={policy.priority}
                label={labelFor(TICKET_PRIORITIES, policy.priority, translate)}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="sla-name">
                {translate("helpdesk.sla.fields.name", { ns: "starter" }, "Policy name")}
              </Label>
              <Input id="sla-name" {...register("name", { required: true })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sla-response">
                  {translate("helpdesk.sla.fields.responseMins", { ns: "starter" }, "Response target (minutes)")}
                </Label>
                <Input
                  id="sla-response"
                  type="number"
                  min={1}
                  {...register("response_mins", { required: true, valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sla-resolve">
                  {translate("helpdesk.sla.fields.resolveMins", { ns: "starter" }, "Resolve target (minutes)")}
                </Label>
                <Input
                  id="sla-resolve"
                  type="number"
                  min={1}
                  {...register("resolve_mins", { required: true, valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {isSubmitSuccessful && !formLoading ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3.5" />
                  {translate("helpdesk.sla.form.saved", { ns: "starter" }, "Saved")}
                </span>
              ) : null}
              <Button type="submit" disabled={formLoading}>
                <Save className={cn("size-4", formLoading && "animate-pulse")} />
                {formLoading
                  ? translate("helpdesk.sla.form.saving", { ns: "starter" }, "Saving...")
                  : translate("helpdesk.sla.form.save", { ns: "starter" }, "Save changes")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </RouteDrawer>
  );
}
