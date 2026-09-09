import {
  useCreate,
  useList,
  useShow,
  useTranslate,
  useUpdate,
} from "@refinedev/core";
import { AlertTriangle, ArrowRightCircle, Pencil } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useOutlet, useParams } from "react-router";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import { LoadingState } from "@/components/app-shell/loading-state";
import { EditButton } from "@/components/resources/buttons/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RouteDrawer,
  RouteDrawerFooter,
} from "@/extensions/nocobase-route-surfaces";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  formatDate,
  labelFor,
  scoreLead,
} from "../constants";
import {
  RecordNav,
  useDrawerShortcuts,
  useRecordNav,
} from "../record-nav";
import {
  useContextualCloseTo,
  useOpenContextualChild,
} from "../route-surfaces";
import {
  CopyLinkButton,
  DetailItems,
  EnumBadge,
  ScorePill,
  useLocale,
} from "../shared";
import type { AccountRecord, ContactRecord, LeadRecord } from "../types";

export function LeadShow() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const closeTo = useContextualCloseTo();
  const { id } = useParams<{ id: string }>();
  const nestedDrawer = useOutlet();
  const nav = useRecordNav({
    listId: "leads",
    currentId: id,
    pathFor: (recordId) => `/leads/show/${recordId}`,
  });
  useDrawerShortcuts({
    onPrev: nav.goPrev,
    onNext: nav.goNext,
    onEdit: () => openChild("edit"),
  });
  const { result: record, query } = useShow<LeadRecord>({
    resource: "hub_sales_leads",
    id,
    meta: { appends: ["owner"] },
  });

  const displayName =
    record?.name ||
    translate("sales.leads.detail.unnamed", { ns: "starter" }, "Unnamed lead");
  const converted = record?.status === "converted";

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
        "sales.leads.drawer.show.description",
        { ns: "starter" },
        "Lead details, qualification and conversion."
      )}
      closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
      closeTo={closeTo}
      nested={nestedDrawer}
      actions={
        record ? (
          <div className="flex items-center gap-1">
            <RecordNav state={nav} />
            <Button
              variant="default"
              size="sm"
              disabled={converted}
              onClick={() => openChild("convert")}
            >
              <ArrowRightCircle />
              {converted
                ? translate(
                    "sales.leads.detail.converted",
                    { ns: "starter" },
                    "Converted"
                  )
                : translate(
                    "sales.leads.detail.convert",
                    { ns: "starter" },
                    "Convert"
                  )}
            </Button>
            <CopyLinkButton />
            <EditButton
              resource="hub_sales_leads"
              recordItemId={record.id}
              variant="outline"
              size="icon-sm"
              onClick={() => openChild("edit")}
            >
              <Pencil />
            </EditButton>
          </div>
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
                "sales.leads.detail.loadError.title",
                { ns: "starter" },
                "Unable to load lead"
              )}
            </AlertTitle>
            <AlertDescription>
              {translate(
                "sales.leads.detail.loadError.description",
                { ns: "starter" },
                "The lead may no longer exist, or you may not have permission to view it."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {record ? <ScoreCard lead={record} /> : null}
            <DetailItems
              title={translate(
                "sales.leads.detail.profile",
                { ns: "starter" },
                "Profile"
              )}
              items={[
                [
                  translate(
                    "sales.leads.fields.company",
                    { ns: "starter" },
                    "Company"
                  ),
                  record?.company || "—",
                ],
                [
                  translate("sales.leads.fields.email", { ns: "starter" }, "Email"),
                  record?.email || "—",
                ],
                [
                  translate(
                    "sales.leads.fields.source",
                    { ns: "starter" },
                    "Source"
                  ),
                  record?.source ? (
                    <EnumBadge
                      key="source"
                      value={record.source}
                      label={labelFor(LEAD_SOURCES, record.source, translate)}
                    />
                  ) : (
                    "—"
                  ),
                ],
                [
                  translate(
                    "sales.leads.fields.status",
                    { ns: "starter" },
                    "Status"
                  ),
                  <EnumBadge
                    key="status"
                    value={record?.status ?? "new"}
                    label={labelFor(LEAD_STATUSES, record?.status ?? "new", translate)}
                  />,
                ],
                [
                  translate("sales.leads.fields.owner", { ns: "starter" }, "Owner"),
                  record?.owner
                    ? record.owner.nickname || record.owner.username || "—"
                    : "—",
                ],
                [
                  translate(
                    "sales.leads.detail.createdAt",
                    { ns: "starter" },
                    "Captured"
                  ),
                  formatDate(record?.createdAt, locale),
                ],
              ]}
            />
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

/**
 * The fit score has no backing column, so the card shows exactly how it was
 * computed instead of presenting a number the user cannot audit.
 */
function ScoreCard({ lead }: { lead: LeadRecord }) {
  const translate = useTranslate();
  const { score, factors } = scoreLead(lead);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">
            {translate("sales.leads.score.title", { ns: "starter" }, "Fit score")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              "sales.leads.score.hint",
              { ns: "starter" },
              "Derived from source, status and completeness — not a stored field."
            )}
          </p>
        </div>
        <ScorePill score={score} />
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${score}%` }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {factors.map((factor) => (
          <div key={factor.key} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-xs text-muted-foreground">
              {translate(factor.labelKey, { ns: "starter" }, factor.key)}
            </dt>
            <dd className="text-xs font-medium tabular-nums">
              +{factor.points}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Duplicate check before conversion — an account with the same name or a
 * contact with the same email almost always means the lead already exists.
 */
function useConversionDuplicates(accountName: string, email: string | null) {
  const trimmedName = accountName.trim();
  const { result: accounts } = useList<AccountRecord>({
    resource: "hub_sales_accounts",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [{ field: "name", operator: "contains", value: trimmedName }],
    errorNotification: false,
    queryOptions: { retry: false, enabled: trimmedName.length >= 3 },
  });
  const { result: contacts } = useList<ContactRecord>({
    resource: "hub_sales_contacts",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: email ? [{ field: "email", operator: "eq", value: email }] : [],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(email) },
  });

  return useMemo(
    () => ({
      accounts: accounts.data.filter(
        (account) =>
          account.name?.trim().toLowerCase() === trimmedName.toLowerCase()
      ),
      contacts: contacts.data,
    }),
    [accounts.data, contacts.data, trimmedName]
  );
}

export function ConvertLead() {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const close = useRouteSurfaceClose();
  const { result: lead, query } = useShow<LeadRecord>({
    resource: "hub_sales_leads",
    id,
  });
  const { mutateAsync: createAccount } = useCreate();
  const { mutateAsync: createContact } = useCreate();
  const { mutateAsync: createDeal } = useCreate();
  const { mutateAsync: updateLead } = useUpdate();

  const [accountName, setAccountName] = useState("");
  const [contactName, setContactName] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicates = useConversionDuplicates(accountName, lead?.email ?? null);

  useEffect(() => {
    if (!lead) return;
    setAccountName((current) => current || lead.company || lead.name || "");
    setContactName((current) => current || lead.name || "");
    setDealTitle(
      (current) =>
        current ||
        (lead.company
          ? `${lead.company} — new opportunity`
          : translate(
              "sales.leads.detail.convert.dealTitleDefault",
              { ns: "starter" },
              "New opportunity"
            ))
    );
  }, [lead, translate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!lead || !id) return;
    if (lead.status === "converted") {
      setError(
        translate(
          "sales.leads.detail.convert.alreadyConverted",
          { ns: "starter" },
          "This lead has already been converted."
        )
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ownerId = lead.owner_id ? Number(lead.owner_id) : null;
      const accountResult = await createAccount({
        resource: "hub_sales_accounts",
        values: { name: accountName, owner: ownerId },
      });
      const accountId = accountResult?.data?.id;
      const contactResult = await createContact({
        resource: "hub_sales_contacts",
        values: {
          name: contactName,
          email: lead.email ?? null,
          account: accountId ?? null,
        },
      });
      const dealResult = await createDeal({
        resource: "hub_sales_deals",
        values: {
          title: dealTitle,
          stage: "inquiry",
          amount: dealAmount ? Number(dealAmount) : null,
          account: accountId ?? null,
          owner: ownerId,
        },
      });
      // The lead is flipped last, and it records where it went — a lead in
      // `converted` without these three targets would be a dangling state.
      await updateLead({
        resource: "hub_sales_leads",
        id,
        values: {
          status: "converted",
          converted_account: accountId ?? null,
          converted_contact: contactResult?.data?.id ?? null,
          converted_deal: dealResult?.data?.id ?? null,
          converted_at: new Date().toISOString(),
          conversion_key: `hub-lead-${id}`,
        },
      });
      close({ skipBeforeClose: true });
    } catch {
      setError(
        translate(
          "sales.leads.detail.convert.error",
          { ns: "starter" },
          "Conversion failed. Check the fields and try again."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RouteDrawer
      title={translate(
        "sales.leads.detail.convert.title",
        { ns: "starter" },
        "Convert lead"
      )}
      description={translate(
        "sales.leads.detail.convert.description",
        { ns: "starter" },
        "Create an account, contact and deal from this lead."
      )}
      closeTo={closeTo}
      closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
    >
      {query.isLoading ? (
        <LoadingState className="min-h-64" />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {duplicates.accounts.length > 0 ||
            duplicates.contacts.length > 0 ? (
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  {translate(
                    "sales.leads.detail.convert.duplicate.title",
                    { ns: "starter" },
                    "Possible duplicate"
                  )}
                </AlertTitle>
                <AlertDescription>
                  {duplicates.accounts.length > 0
                    ? translate(
                        "sales.leads.detail.convert.duplicate.account",
                        { ns: "starter" },
                        "An account named “{{name}}” already exists."
                      ).replace("{{name}}", duplicates.accounts[0].name ?? "")
                    : translate(
                        "sales.leads.detail.convert.duplicate.contact",
                        { ns: "starter" },
                        "A contact with this email already exists: {{name}}."
                      ).replace("{{name}}", duplicates.contacts[0].name ?? "")}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="convert-account-name">
                {translate(
                  "sales.leads.detail.convert.accountName",
                  { ns: "starter" },
                  "Account name"
                )}
              </Label>
              <Input
                id="convert-account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.currentTarget.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convert-contact-name">
                {translate(
                  "sales.leads.detail.convert.contactName",
                  { ns: "starter" },
                  "Primary contact"
                )}
              </Label>
              <Input
                id="convert-contact-name"
                value={contactName}
                onChange={(event) => setContactName(event.currentTarget.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convert-deal-title">
                {translate(
                  "sales.leads.detail.convert.dealTitle",
                  { ns: "starter" },
                  "Deal title"
                )}
              </Label>
              <Input
                id="convert-deal-title"
                value={dealTitle}
                onChange={(event) => setDealTitle(event.currentTarget.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convert-deal-amount">
                {translate(
                  "sales.leads.detail.convert.dealAmount",
                  { ns: "starter" },
                  "Deal amount (optional)"
                )}
              </Label>
              <Input
                id="convert-deal-amount"
                type="number"
                min={0}
                step="0.01"
                value={dealAmount}
                onChange={(event) => setDealAmount(event.currentTarget.value)}
                placeholder="88000"
              />
            </div>
          </div>
          <RouteDrawerFooter className="flex-row justify-end">
            <Button type="button" variant="outline" onClick={() => close()}>
              {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? translate(
                    "sales.leads.detail.convert.submitting",
                    { ns: "starter" },
                    "Converting..."
                  )
                : translate(
                    "sales.leads.detail.convert.submit",
                    { ns: "starter" },
                    "Convert lead"
                  )}
            </Button>
          </RouteDrawerFooter>
        </form>
      )}
    </RouteDrawer>
  );
}
