import { useShow, useTranslate, useUpdate } from "@refinedev/core";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  TICKET_STATUSES,
  labelFor,
  statusClassFor,
} from "../constants";
import { getTicketShowPath, helpdeskRoutes } from "../routes";
import { StatusPill } from "../shared";
import type { TicketRecord } from "../types";

const TICKETS = "hub_hd_tickets";
const SAFE_TRANSITIONS: Record<string, string[]> = {
  open: ["pending"],
  pending: ["open"],
  resolved: [],
  closed: [],
};

/**
 * Lightweight nested (2nd-level) drawer for the common "just move this
 * ticket along" action — a quick status transition without opening the
 * full edit form. Lives at /tickets/show/:id/status.
 */
export const TicketStatusChange = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const close = useRouteSurfaceClose();
  const { result: ticket, query } = useShow<TicketRecord>({
    resource: TICKETS,
    id,
  });
  const { mutate } = useUpdate<TicketRecord>();
  const [isSaving, setIsSaving] = useState(false);
  const allowed = SAFE_TRANSITIONS[ticket?.status ?? "open"] ?? [];

  const applyStatus = (status: string) => {
    if (!id || status === ticket?.status || !allowed.includes(status)) return;
    setIsSaving(true);
    mutate(
      { resource: TICKETS, id, values: { status } },
      {
        onSuccess: () => close({ skipBeforeClose: true }),
        onError: () => setIsSaving(false),
      }
    );
  };

  return (
    <RouteDrawer
      title={translate("helpdesk.status.title", { ns: "starter" }, "Change status")}
      description={translate(
        "helpdesk.status.description",
        { ns: "starter" },
        "Move this ticket to a different stage in the queue."
      )}
      closeLabel={translate("buttons.close", "Close")}
      closeTo={id ? getTicketShowPath(id) : helpdeskRoutes.tickets}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {query.isLoading && !ticket ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {translate("helpdesk.status.current", { ns: "starter" }, "Current status")}
              </span>
              <StatusPill
                value={ticket?.status}
                label={labelFor(TICKET_STATUSES, ticket?.status, translate)}
              />
            </div>
            <div className="space-y-2">
              {TICKET_STATUSES.filter(
                (status) =>
                  status.value === ticket?.status || allowed.includes(status.value)
              ).map((status) => {
                const active = status.value === ticket?.status;
                return (
                  <button
                    key={status.value}
                    type="button"
                    disabled={isSaving || active}
                    onClick={() => applyStatus(status.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      active
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/70 hover:border-primary/40 hover:bg-accent/40",
                      isSaving && !active && "opacity-60"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex size-2 shrink-0 rounded-full",
                          statusClassFor(status.value).split(" ")[0]
                        )}
                      />
                      <span className="font-medium text-foreground">
                        {labelFor(TICKET_STATUSES, status.value, translate)}
                      </span>
                    </span>
                    {active ? (
                      <Check className="size-4 text-primary" />
                    ) : isSaving ? null : (
                      <span className="text-xs text-muted-foreground">
                        {translate("helpdesk.status.apply", { ns: "starter" }, "Set")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Alert>
              <AlertTitle>
                {translate(
                  "helpdesk.status.resolutionUnavailable.title",
                  { ns: "starter" },
                  "Resolution workflow requires server support"
                )}
              </AlertTitle>
              <AlertDescription>
                {translate(
                  "helpdesk.status.resolutionUnavailable.description",
                  { ns: "starter" },
                  "Resolve, close and reopen are unavailable until the server can require a resolution and write immutable lifecycle timestamps."
                )}
              </AlertDescription>
            </Alert>
            {isSaving ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {translate("helpdesk.status.saving", { ns: "starter" }, "Updating...")}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </RouteDrawer>
  );
};
