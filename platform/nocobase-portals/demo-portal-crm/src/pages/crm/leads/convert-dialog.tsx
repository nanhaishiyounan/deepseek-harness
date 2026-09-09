import { useList, useNotification, useTranslate } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  HandCoins,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "../constants";
import { CustomerPicker } from "../pickers";
import { useOpenRecord } from "../record-links";
import { useLocale } from "../shared";
import type {
  ContactRecord,
  CustomerRecord,
  DealRecord,
  LeadRecord,
} from "../types";

type ConvertTarget = "new" | "existing";

const defaultCloseDate = () =>
  new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);

/**
 * Lead conversion, modelled on the Salesforce "Convert Lead" screen: the rep
 * decides whether the lead becomes a new account or joins an existing one,
 * whether a contact is created, and what the resulting opportunity looks like —
 * instead of the system silently inventing all three.
 */
export function LeadConvertDialog({
  lead,
  open,
  onOpenChange,
  onConverted,
}: {
  lead: LeadRecord | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted: () => Promise<unknown> | void;
}) {
  const translate = useTranslate();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const openRecord = useOpenRecord();
  const { open: notify } = useNotification();

  const [target, setTarget] = useState<ConvertTarget>("new");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [createContact, setCreateContact] = useState(true);
  const [createDeal, setCreateDeal] = useState(true);
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState(25000);
  const [closeDate, setCloseDate] = useState(defaultCloseDate);
  const [converting, setConverting] = useState(false);

  // Duplicate check: a company that already exists should be joined, not
  // cloned. This is the same guard rail a CRM admin turns on first.
  const duplicates = useList<CustomerRecord>({
    resource: "crm_customers",
    filters: lead?.company
      ? [{ field: "company_name", operator: "contains", value: lead.company }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    errorNotification: false,
    queryOptions: { enabled: open && Boolean(lead?.company), retry: false },
  });
  const duplicateMatches = lead?.company ? duplicates.result.data : [];

  useEffect(() => {
    if (!open || !lead) return;
    setTarget(duplicateMatches.length > 0 ? "existing" : "new");
    setCustomerId(
      duplicateMatches.length > 0 ? String(duplicateMatches[0].id) : null
    );
    setDealTitle(`${lead.company || lead.name} opportunity`);
    setDealAmount(Math.max(Number(lead.score ?? 25), 25) * 1000);
    setCloseDate(defaultCloseDate());
    setCreateContact(true);
    setCreateDeal(true);
    // Only re-seed when the dialog is (re)opened for a lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, duplicateMatches.length]);

  const blockers = useMemo(() => {
    const messages: string[] = [];
    if (target === "existing" && !customerId) {
      messages.push(
        translate(
          "crm.leads.convert.pickAccount",
          { ns: "starter" },
          "Choose the account this lead belongs to."
        )
      );
    }
    if (createDeal && !dealTitle.trim()) {
      messages.push(
        translate(
          "crm.leads.convert.dealTitleRequired",
          { ns: "starter" },
          "Give the opportunity a name."
        )
      );
    }
    if (createDeal && !(dealAmount > 0)) {
      messages.push(
        translate(
          "crm.leads.convert.dealAmountRequired",
          { ns: "starter" },
          "An opportunity needs an amount above zero."
        )
      );
    }
    return messages;
  }, [createDeal, customerId, dealAmount, dealTitle, target, translate]);

  const convert = async () => {
    if (!lead) return;
    if (lead.status === "converted") {
      notify?.({
        type: "error",
        message: translate(
          "crm.leads.convert.alreadyConverted",
          { ns: "starter" },
          "This lead has already been converted."
        ),
      });
      return;
    }
    if (blockers.length > 0) return;
    setConverting(true);
    try {
      let accountId: string | number;
      if (target === "existing" && customerId) {
        accountId = customerId;
      } else {
        const created = await nocobaseClient.action<CustomerRecord>(
          "crm_customers",
          "create",
          {
            body: {
              company_name: lead.company || lead.name,
              phone: lead.phone || null,
              status: "active",
              notes: `Converted from lead ${lead.name}. Primary email: ${lead.email ?? "not provided"}.`,
              ownerId: lead.owner_id ?? null,
            },
          }
        );
        accountId = created.id;
      }

      let contact: ContactRecord | null = null;
      if (createContact && lead.name) {
        contact = await nocobaseClient.action<ContactRecord>("crm_contacts", "create", {
          body: {
            name: lead.name,
            email: lead.email || null,
            phone: lead.phone || null,
            customer: accountId,
            notes: `Created during lead conversion (${lead.source ?? "unknown source"}).`,
          },
        });
      }

      let deal: DealRecord | null = null;
      if (createDeal) {
        deal = await nocobaseClient.action<DealRecord>("crm_deals", "create", {
          body: {
            title: dealTitle.trim(),
            stage: "inquiry",
            amount: dealAmount,
            expected_close_date: closeDate || null,
            customer: accountId,
            ownerId: lead.owner_id ?? null,
            notes: `Created from converted lead ${lead.name}.`,
          },
        });
      }

      await nocobaseClient.action("crm_leads", "update", {
        query: { filterByTk: lead.id },
        body: {
          status: "converted",
          score: 100,
          converted_customer: accountId,
          converted_contact: contact?.id ?? null,
          converted_deal: deal?.id ?? null,
          converted_at: new Date().toISOString(),
          conversion_key: `crm-lead-${lead.id}`,
        },
      });

      await onConverted();
      await queryClient.invalidateQueries();
      notify?.({
        type: "success",
        message: translate("crm.leads.convert.success", { ns: "starter" }, "Lead converted"),
        description: translate(
          "crm.leads.convert.successDetail",
          { ns: "starter" },
          "The account, contact and opportunity you selected were created."
        ),
      });
      onOpenChange(false);
      if (deal) openRecord.deal(deal.id);
      else openRecord.customer(accountId);
    } catch (error) {
      notify?.({
        type: "error",
        message: translate("crm.leads.convert.error", { ns: "starter" }, "Conversion failed"),
        description:
          error instanceof Error
            ? error.message
            : translate("crm.common.tryAgain", { ns: "starter" }, "Please try again."),
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate("crm.leads.convert.title", { ns: "starter" }, "Convert this lead?")}
          </DialogTitle>
          <DialogDescription>
            {translate(
              "crm.leads.convert.description",
              { ns: "starter" },
              "Choose what the lead becomes. Nothing is written until you confirm."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="size-4 text-blue-600" />
              {translate("crm.leads.convert.account", { ns: "starter" }, "Account")}
            </div>
            {duplicateMatches.length > 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                {translate(
                  "crm.leads.convert.duplicateWarning",
                  { ns: "starter" },
                  "An account with a similar name already exists. Attach the lead instead of creating a duplicate."
                )}
              </p>
            ) : null}
            <div className="grid gap-2">
              <ChoiceRow
                selected={target === "new"}
                onSelect={() => setTarget("new")}
                title={translate(
                  "crm.leads.convert.newAccount",
                  { ns: "starter" },
                  "Create a new account"
                )}
                detail={lead?.company || lead?.name || "—"}
              />
              <ChoiceRow
                selected={target === "existing"}
                onSelect={() => setTarget("existing")}
                title={translate(
                  "crm.leads.convert.existingAccount",
                  { ns: "starter" },
                  "Attach to an existing account"
                )}
                detail={
                  <div onClick={(event) => event.stopPropagation()}>
                    <CustomerPicker
                      value={customerId}
                      onChange={(value) => {
                        setCustomerId(value);
                        setTarget("existing");
                      }}
                    />
                  </div>
                }
              />
            </div>
          </section>

          <section className="space-y-2">
            <label className="flex items-start gap-2.5 rounded-lg border p-3">
              <Checkbox
                checked={createContact}
                onCheckedChange={(checked) => setCreateContact(Boolean(checked))}
              />
              <span className="space-y-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <User className="size-4 text-blue-600" />
                  {translate("crm.leads.convert.contact", { ns: "starter" }, "Create contact")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {lead?.name}
                  {lead?.email ? ` · ${lead.email}` : ""}
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-3">
            <label className="flex items-start gap-2.5 rounded-lg border p-3">
              <Checkbox
                checked={createDeal}
                onCheckedChange={(checked) => setCreateDeal(Boolean(checked))}
              />
              <span className="space-y-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <HandCoins className="size-4 text-blue-600" />
                  {translate(
                    "crm.leads.convert.opportunity",
                    { ns: "starter" },
                    "Create an opportunity"
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate(
                    "crm.leads.convert.opportunityHint",
                    { ns: "starter" },
                    "Starts in the Inquiry stage of the pipeline."
                  )}
                </span>
              </span>
            </label>
            {createDeal ? (
              <div className="grid gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="convert-deal-title">
                    {translate("crm.deals.fields.title", { ns: "starter" }, "Deal")}
                  </Label>
                  <Input
                    id="convert-deal-title"
                    value={dealTitle}
                    onChange={(event) => setDealTitle(event.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="convert-deal-amount">
                      {translate("crm.deals.fields.amount", { ns: "starter" }, "Amount")}
                    </Label>
                    <Input
                      id="convert-deal-amount"
                      type="number"
                      min={0}
                      value={dealAmount}
                      onChange={(event) =>
                        setDealAmount(Math.max(0, Number(event.target.value)))
                      }
                    />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(dealAmount, locale)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convert-deal-close">
                      {translate(
                        "crm.deals.fields.expectedClose",
                        { ns: "starter" },
                        "Expected close"
                      )}
                    </Label>
                    <Input
                      id="convert-deal-close"
                      type="date"
                      value={closeDate}
                      onChange={(event) => setCloseDate(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {blockers.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {blockers.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button
            disabled={converting || blockers.length > 0}
            onClick={() => void convert()}
          >
            {converting ? (
              translate("crm.leads.convert.converting", { ns: "starter" }, "Converting...")
            ) : (
              <>
                <ArrowRight />
                {translate("crm.leads.actions.convert", { ns: "starter" }, "Convert")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      className={cn(
        "cursor-pointer space-y-1.5 rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-accent/40"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full border",
            selected ? "border-primary" : "border-input"
          )}
        >
          {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="pl-6 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
