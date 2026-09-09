import {
  type HttpError,
  useGetIdentity,
  useGetLocale,
  useList,
  useShow,
  useTranslate,
} from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import { ArrowRightLeft, Pencil, RotateCw, Send, ShieldCheck, Trash2 } from "lucide-react";
import { Link, useNavigate, useOutlet, useParams } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { RefreshButton } from "@/components/resources/buttons/refresh";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  formatDateTime,
  initialsFor,
  labelFor,
  relativeTime,
} from "../constants";
import { getSlaPolicyShowPath, helpdeskRoutes } from "../routes";
import { slaLabel, slaStateFor, slaTone } from "../sla";
import { useOpenContextualChild } from "../route-surfaces";
import {
  CategoryBadge,
  DetailItems,
  PriorityPill,
  StatusPill,
  userLabel,
} from "../shared";
import type {
  ReplyRecord,
  SlaPolicyRecord,
  TicketRecord,
  UserRef,
} from "../types";

const TICKETS = "hub_hd_tickets";
const REPLIES = "hub_hd_replies";
const SLA_POLICIES = "hub_hd_sla_policies";

export const TicketShow = () => {
  const translate = useTranslate();
  const getLocale = useGetLocale();
  const locale = getLocale();
  const navigate = useNavigate();
  const openChild = useOpenContextualChild();
  const { id } = useParams<{ id: string }>();
  const nestedDrawer = useOutlet();

  const { result: ticket, query } = useShow<TicketRecord>({
    resource: TICKETS,
    id,
    meta: { appends: ["requester", "assignee"] },
  });

  const subject =
    ticket?.subject ||
    (query.isLoading
      ? ""
      : translate("helpdesk.show.fallbackTitle", { ns: "starter" }, "Ticket"));

  return (
    <RouteDrawer
      title={
        query.isLoading && !ticket ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          subject
        )
      }
      description={translate(
        "helpdesk.show.description",
        { ns: "starter" },
        "Full history of this support request, with the reply thread."
      )}
      closeLabel={translate("buttons.close", "Close")}
      closeTo={helpdeskRoutes.tickets}
      nested={nestedDrawer}
      actions={
        ticket ? (
          <>
            <RefreshButton
              resource={TICKETS}
              recordItemId={ticket.id}
              variant="outline"
              size="icon-sm"
              aria-label={translate("buttons.refresh", "Refresh")}
              title={translate("buttons.refresh", "Refresh")}
            >
              <RotateCw />
            </RefreshButton>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={translate("helpdesk.show.changeStatus", { ns: "starter" }, "Change status")}
              title={translate("helpdesk.show.changeStatus", { ns: "starter" }, "Change status")}
              onClick={() => navigate("status")}
            >
              <ArrowRightLeft />
            </Button>
            <EditButton
              resource={TICKETS}
              recordItemId={ticket.id}
              variant="outline"
              size="icon-sm"
              aria-label={translate("helpdesk.show.editTicket", { ns: "starter" }, "Edit ticket")}
              title={translate("helpdesk.show.editTicket", { ns: "starter" }, "Edit ticket")}
              onClick={() => navigate("edit")}
            >
              <Pencil />
            </EditButton>
          </>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading ? (
          <LoadingState className="min-h-64" />
        ) : query.isError || !ticket ? (
          <Alert variant="destructive">
            <AlertTitle>
              {translate("helpdesk.show.errorTitle", { ns: "starter" }, "Unable to load ticket")}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "helpdesk.show.errorDescription",
                { ns: "starter" },
                "The ticket may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                value={ticket.status}
                label={labelFor(TICKET_STATUSES, ticket.status, translate)}
              />
              <PriorityPill
                value={ticket.priority}
                label={labelFor(TICKET_PRIORITIES, ticket.priority, translate)}
              />
              {ticket.category ? (
                <CategoryBadge
                  value={ticket.category}
                  label={labelFor(TICKET_CATEGORIES, ticket.category, translate)}
                />
              ) : null}
            </div>

            {ticket.description ? (
              <p className="text-sm leading-6 text-foreground whitespace-pre-wrap">
                {ticket.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {translate(
                  "helpdesk.show.noDescription",
                  { ns: "starter" },
                  "No description provided."
                )}
              </p>
            )}

            <Separator />

            <DetailItems
              title={translate("helpdesk.show.details", { ns: "starter" }, "Details")}
              items={[
                [
                  translate("helpdesk.fields.requester", { ns: "starter" }, "Requester"),
                  userLabel(ticket.requester, translate),
                ],
                [
                  translate("helpdesk.fields.assignee", { ns: "starter" }, "Assignee"),
                  userLabel(ticket.assignee, translate),
                ],
                [
                  translate("helpdesk.show.opened", { ns: "starter" }, "Opened"),
                  formatDateTime(ticket.createdAt, locale),
                ],
                [
                  translate("helpdesk.show.lastUpdated", { ns: "starter" }, "Last updated"),
                  formatDateTime(ticket.updatedAt, locale),
                ],
              ]}
            />

            <MatchedSla ticket={ticket} />

            <Separator />

            <RepliesThread
              ticketId={ticket.id}
              requesterId={ticket.requesterId}
              openChild={openChild}
            />
          </div>
        )}
      </div>
    </RouteDrawer>
  );
};

// ---------------------------------------------------------------------------
// Matched SLA — surfaces the SLA policy that applies to this ticket's
// priority as a read-only reference, linking through to the policy detail.
// ---------------------------------------------------------------------------

function slaMinutesLabel(
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

function MatchedSla({ ticket }: { ticket: TicketRecord }) {
  const translate = useTranslate();
  const priority = ticket.priority;
  const { result, query } = useList<SlaPolicyRecord>({
    resource: SLA_POLICIES,
    filters: priority
      ? [{ field: "priority", operator: "eq", value: priority }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 1 },
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(priority) },
  });

  const policy = result.data?.[0];
  const byPriority = useMemo(() => {
    const map = new Map<string, SlaPolicyRecord>();
    if (policy?.priority) map.set(policy.priority, policy);
    return map;
  }, [policy]);
  const state = useMemo(
    () => slaStateFor(ticket, byPriority),
    [byPriority, ticket]
  );

  if (query.isLoading || !policy) return null;

  const tone = state ? slaTone(state) : "ok";

  return (
    <>
      <Separator />
      <section className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck className="size-4 text-muted-foreground" />
          {translate("helpdesk.show.matchedSla", { ns: "starter" }, "Matched SLA")}
        </h3>

        {state && (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
              tone === "breached" && "border-red-500/40 bg-red-500/[0.06]",
              tone === "risk" && "border-amber-500/40 bg-amber-500/[0.06]",
              tone === "ok" && "border-border/70 bg-muted/30"
            )}
          >
            <div>
              <p className="text-xs text-muted-foreground">
                {state.isRunning
                  ? translate("helpdesk.sla.countdown", { ns: "starter" }, "Time to resolve")
                  : translate("helpdesk.sla.outcome", { ns: "starter" }, "SLA outcome")}
              </p>
              <p
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  tone === "breached" && "text-red-600 dark:text-red-400",
                  tone === "risk" && "text-amber-600 dark:text-amber-400"
                )}
              >
                {slaLabel(state, translate)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {translate("helpdesk.sla.dueAt", { ns: "starter" }, "Target {{time}}").replace(
                "{{time}}",
                formatDateTime(state.resolveDueAt.toISOString(), "en-US")
              )}
            </p>
          </div>
        )}
        <Link
          to={getSlaPolicyShowPath(policy.id)}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <span className="font-medium text-foreground">{policy.name || "—"}</span>
          <span className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {translate("helpdesk.sla.columns.response", { ns: "starter" }, "Response target")}
              {": "}
              <span className="font-medium text-foreground">
                {slaMinutesLabel(policy.response_mins, translate)}
              </span>
            </span>
            <span>
              {translate("helpdesk.sla.columns.resolve", { ns: "starter" }, "Resolve target")}
              {": "}
              <span className="font-medium text-foreground">
                {slaMinutesLabel(policy.resolve_mins, translate)}
              </span>
            </span>
          </span>
        </Link>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Replies thread — the sub-table + inline reply composer.
// ---------------------------------------------------------------------------

function RepliesThread({
  ticketId,
  requesterId,
  openChild,
}: {
  ticketId: number | string;
  requesterId?: number | string | null;
  openChild: (to: string) => void;
}) {
  const translate = useTranslate();
  const getLocale = useGetLocale();
  const locale = getLocale();

  const { result, query } = useList<ReplyRecord>({
    resource: REPLIES,
    filters: [{ field: "ticketId", operator: "eq", value: ticketId }],
    sorters: [{ field: "createdAt", order: "asc" }],
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    meta: { appends: ["author"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const replies = result.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {translate("helpdesk.thread.title", { ns: "starter" }, "Replies")}
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {translate(
            "helpdesk.thread.count",
            { ns: "starter", count: replies.length },
            `${replies.length} ${replies.length === 1 ? "message" : "messages"}`
          )}
        </span>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-3/4" />
        </div>
      ) : replies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
          {translate(
            "helpdesk.thread.empty",
            { ns: "starter" },
            "No replies yet. Start the conversation below."
          )}
        </p>
      ) : (
        <ol className="space-y-3">
          {replies.map((reply) => {
            // Anything written by the requester is the customer side of the
            // conversation; everyone else is the support agent.
            const fromRequester =
              requesterId != null &&
              String(reply.authorId ?? reply.author?.id ?? "") === String(requesterId);
            return (
            <li
              key={reply.id}
              className={cn(
                "flex gap-3 rounded-xl border p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
                fromRequester
                  ? "border-border/70 bg-card"
                  : "border-primary/25 bg-primary/[0.04]"
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  fromRequester
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/12 text-primary"
                )}
              >
                {initialsFor(userLabel(reply.author as UserRef, translate))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {userLabel(reply.author as UserRef, translate)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        fromRequester
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/12 text-primary"
                      )}
                    >
                      {fromRequester
                        ? translate("helpdesk.thread.fromRequester", { ns: "starter" }, "Requester")
                        : translate("helpdesk.thread.fromAgent", { ns: "starter" }, "Agent")}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className="text-xs text-muted-foreground"
                      title={formatDateTime(reply.createdAt, locale)}
                    >
                      {relativeTime(reply.createdAt, translate)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={translate("helpdesk.reply.edit", { ns: "starter" }, "Edit reply")}
                      title={translate("helpdesk.reply.edit", { ns: "starter" }, "Edit reply")}
                      onClick={() =>
                        openChild(`replies/edit/${encodeURIComponent(String(reply.id))}`)
                      }
                    >
                      <Pencil />
                    </Button>
                    <DeleteButton
                      resource={REPLIES}
                      recordItemId={reply.id}
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </DeleteButton>
                  </div>
                </div>
                <p className="mt-1 text-sm leading-6 text-foreground whitespace-pre-wrap">
                  {reply.body}
                </p>
              </div>
            </li>
            );
          })}
        </ol>
      )}

      <ReplyComposer ticketId={ticketId} />
    </section>
  );
}

type ReplyFormValues = {
  body: string;
  ticketId?: number | string;
  authorId?: number | string | null;
};

function ReplyComposer({ ticketId }: { ticketId: number | string }) {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ReplyRecord, HttpError, ReplyFormValues>({
    refineCoreProps: {
      resource: REPLIES,
      action: "create",
      redirect: false,
      onMutationSuccess: () => form.reset({ body: "" }),
    },
    defaultValues: { body: "" },
  });

  const body = form.watch("body");
  const canSend = Boolean(body?.trim()) && !form.formState.isSubmitting;

  const submit = form.handleSubmit((values) => {
    if (!values.body.trim()) return;
    onFinish({
      body: values.body.trim(),
      ticketId,
      authorId: identity?.id ?? null,
    });
  });

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        {...form.register("body")}
        placeholder={translate("helpdesk.thread.placeholder", { ns: "starter" }, "Write a reply...")}
        className="min-h-24"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!canSend}>
          <Send className={cn("size-4", form.formState.isSubmitting && "animate-pulse")} />
          {form.formState.isSubmitting
            ? translate("helpdesk.thread.sending", { ns: "starter" }, "Sending...")
            : translate("helpdesk.thread.send", { ns: "starter" }, "Send reply")}
        </Button>
      </div>
    </form>
  );
}
