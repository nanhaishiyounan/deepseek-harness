import { useList, useTranslate } from "@refinedev/core";
import {
  Building2,
  Contact as ContactIcon,
  FileText,
  Package,
  Search,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { INDUSTRIES, formatCurrency, labelFor } from "./constants";
import { searchFilter, useDebouncedValue } from "./list-controls";
import {
  readRecentRecords,
  trackRecentRecord,
  type RecentRecord,
  type RecentRecordKind,
} from "./recent-records";
import { crmRoutes } from "./routes";
import { useLocale } from "./shared";
import type {
  ContactRecord,
  CustomerRecord,
  DealRecord,
  LeadRecord,
  ProductRecord,
  QuoteRecord,
} from "./types";

type CrmGlobalSearchProps = {
  iconOnly?: boolean;
  className?: string;
};

type SearchResult = {
  kind: RecentRecordKind;
  id: string;
  label: string;
  secondary?: string;
  route: string;
  icon: LucideIcon;
};

type SearchGroup = {
  kind: RecentRecordKind;
  heading: string;
  rows: SearchResult[];
};

const iconsByKind: Record<RecentRecordKind, LucideIcon> = {
  customer: Building2,
  contact: ContactIcon,
  lead: UserPlus,
  deal: Workflow,
  quote: FileText,
  product: Package,
};

function recordRoute(kind: RecentRecordKind, id: string): string {
  switch (kind) {
    case "customer":
      return `${crmRoutes.customers}/show/${id}`;
    case "contact":
      return `${crmRoutes.contacts}/show/${id}`;
    case "lead":
      return `${crmRoutes.leads}/show/${id}`;
    case "deal":
      return `${crmRoutes.pipeline}/show/${id}`;
    case "quote":
      return `${crmRoutes.quotes}/show/${id}`;
    case "product":
      return `${crmRoutes.products}/show/${id}`;
  }
}

function secondaryLabel(
  ...parts: Array<string | null | undefined>
): string | undefined {
  const label = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return label || undefined;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function CrmGlobalSearch({
  iconOnly,
  className,
}: CrmGlobalSearchProps) {
  const translate = useTranslate();
  const locale = useLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const trimmedTerm = term.trim();
  const debouncedTerm = useDebouncedValue(trimmedTerm, 250);
  const queryEnabled = trimmedTerm.length >= 2 && debouncedTerm.length >= 2;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) setRecentRecords(readRecentRecords());
  }, [open]);

  const customers = useList<CustomerRecord>({
    resource: "crm_customers",
    filters: searchFilter(["company_name", "phone"], debouncedTerm),
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    errorNotification: false,
    queryOptions: { enabled: queryEnabled, retry: false },
  });
  const contacts = useList<ContactRecord>({
    resource: "crm_contacts",
    filters: searchFilter(["name", "email", "job_title"], debouncedTerm),
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    meta: { appends: ["customer"] },
    errorNotification: false,
    queryOptions: { enabled: queryEnabled, retry: false },
  });
  const leads = useList<LeadRecord>({
    resource: "crm_leads",
    filters: searchFilter(["name", "company", "email"], debouncedTerm),
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    errorNotification: false,
    queryOptions: { enabled: queryEnabled, retry: false },
  });
  const deals = useList<DealRecord>({
    resource: "crm_deals",
    filters: searchFilter(["title"], debouncedTerm),
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    meta: { appends: ["customer"] },
    errorNotification: false,
    queryOptions: { enabled: queryEnabled, retry: false },
  });
  const quotes = useList<QuoteRecord>({
    resource: "crm_quotes",
    filters: searchFilter(["quote_number"], debouncedTerm),
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    meta: { appends: ["customer"] },
    errorNotification: false,
    queryOptions: { enabled: queryEnabled, retry: false },
  });
  const products = useList<ProductRecord>({
    resource: "crm_products",
    filters: searchFilter(["name", "sku"], debouncedTerm),
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    errorNotification: false,
    queryOptions: { enabled: queryEnabled, retry: false },
  });

  const groups: SearchGroup[] = [
    {
      kind: "customer",
      heading: translate(
        "crm.search.groups.customers",
        { ns: "starter" },
        "Customers"
      ),
      rows: customers.result.data.map((record) => ({
        kind: "customer",
        id: String(record.id),
        label: record.company_name ?? "",
        secondary: record.industry
          ? labelFor(INDUSTRIES, record.industry, translate)
          : undefined,
        route: recordRoute("customer", String(record.id)),
        icon: Building2,
      })),
    },
    {
      kind: "contact",
      heading: translate(
        "crm.search.groups.contacts",
        { ns: "starter" },
        "Contacts"
      ),
      rows: contacts.result.data.map((record) => ({
        kind: "contact",
        id: String(record.id),
        label: record.name ?? "",
        secondary: secondaryLabel(
          record.customer?.company_name,
          record.job_title
        ),
        route: recordRoute("contact", String(record.id)),
        icon: ContactIcon,
      })),
    },
    {
      kind: "lead",
      heading: translate(
        "crm.search.groups.leads",
        { ns: "starter" },
        "Leads"
      ),
      rows: leads.result.data.map((record) => ({
        kind: "lead",
        id: String(record.id),
        label: record.name ?? "",
        secondary: record.company ?? undefined,
        route: recordRoute("lead", String(record.id)),
        icon: UserPlus,
      })),
    },
    {
      kind: "deal",
      heading: translate(
        "crm.search.groups.deals",
        { ns: "starter" },
        "Deals"
      ),
      rows: deals.result.data.map((record) => ({
        kind: "deal",
        id: String(record.id),
        label: record.title ?? "",
        secondary: secondaryLabel(
          record.customer?.company_name,
          formatCurrency(record.amount, locale)
        ),
        route: recordRoute("deal", String(record.id)),
        icon: Workflow,
      })),
    },
    {
      kind: "quote",
      heading: translate(
        "crm.search.groups.quotes",
        { ns: "starter" },
        "Quotes"
      ),
      rows: quotes.result.data.map((record) => ({
        kind: "quote",
        id: String(record.id),
        label: record.quote_number ?? "",
        secondary: secondaryLabel(
          record.customer?.company_name,
          formatCurrency(record.total, locale)
        ),
        route: recordRoute("quote", String(record.id)),
        icon: FileText,
      })),
    },
    {
      kind: "product",
      heading: translate(
        "crm.search.groups.products",
        { ns: "starter" },
        "Products"
      ),
      rows: products.result.data.map((record) => ({
        kind: "product",
        id: String(record.id),
        label: record.name ?? "",
        secondary: record.sku ?? undefined,
        route: recordRoute("product", String(record.id)),
        icon: Package,
      })),
    },
  ];

  const queries = [
    customers.query,
    contacts.query,
    leads.query,
    deals.query,
    quotes.query,
    products.query,
  ];
  const isSearchTerm = trimmedTerm.length >= 2;
  const isLoading =
    isSearchTerm &&
    (trimmedTerm !== debouncedTerm ||
      queries.some((query) => query.isLoading || query.isFetching));

  const selectResult = (result: SearchResult) => {
    trackRecentRecord({
      kind: result.kind,
      id: result.id,
      label: result.label,
    });
    setOpen(false);
    setTerm("");
    navigate(result.route);
  };

  const searchLabel = translate(
    "crm.search.trigger",
    { ns: "starter" },
    "Search records"
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon" : "default"}
        className={cn(
          !iconOnly && "min-w-52 justify-start text-muted-foreground",
          className
        )}
        aria-label={searchLabel}
        onClick={() => setOpen(true)}
      >
        <Search />
        {iconOnly ? null : (
          <>
            <span>{searchLabel}</span>
            <Kbd className="ml-auto">
              {translate("crm.search.shortcut", { ns: "starter" }, "⌘K")}
            </Kbd>
          </>
        )}
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={translate(
          "crm.search.dialogTitle",
          { ns: "starter" },
          "Search CRM records"
        )}
        description={translate(
          "crm.search.dialogDescription",
          { ns: "starter" },
          "Search customers, contacts, leads, deals, quotes, and products."
        )}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder={translate(
              "crm.search.placeholder",
              { ns: "starter" },
              "Search customers, deals, quotes..."
            )}
          />
          <CommandList>
            {isSearchTerm ? (
              isLoading ? (
                <div className="flex items-center gap-3 px-3 py-4">
                  <Skeleton className="size-5" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                  <span className="sr-only">
                    {translate(
                      "crm.search.loading",
                      { ns: "starter" },
                      "Searching records..."
                    )}
                  </span>
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {translate(
                      "crm.search.noResults",
                      { ns: "starter" },
                      "No records match that search."
                    )}
                  </CommandEmpty>
                  {groups.map((group) =>
                    group.rows.length ? (
                      <CommandGroup key={group.kind} heading={group.heading}>
                        {group.rows.map((result) => {
                          const Icon = result.icon;
                          return (
                            <CommandItem
                              key={`${result.kind}:${result.id}`}
                              value={`${result.kind}:${result.id}:${result.label}`}
                              onSelect={() => selectResult(result)}
                            >
                              <Icon className="size-4 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {result.label}
                              </span>
                              {result.secondary ? (
                                <span className="max-w-52 truncate text-xs text-muted-foreground">
                                  {result.secondary}
                                </span>
                              ) : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ) : null
                  )}
                </>
              )
            ) : (
              <>
                {recentRecords.length ? (
                  <CommandGroup
                    heading={translate(
                      "crm.search.recentHeading",
                      { ns: "starter" },
                      "Recently viewed"
                    )}
                  >
                    {recentRecords.map((recent) => {
                      const Icon = iconsByKind[recent.kind];
                      const result: SearchResult = {
                        ...recent,
                        route: recordRoute(recent.kind, recent.id),
                        icon: Icon,
                      };
                      return (
                        <CommandItem
                          key={`${recent.kind}:${recent.id}`}
                          value={`recent:${recent.kind}:${recent.id}:${recent.label}`}
                          onSelect={() => selectResult(result)}
                        >
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="truncate font-medium">
                            {recent.label}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {translate(
                      "crm.search.noRecent",
                      { ns: "starter" },
                      "Recently viewed records will appear here."
                    )}
                  </p>
                )}
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  {translate(
                    "crm.search.hint",
                    { ns: "starter" },
                    "Type at least 2 characters to search all CRM records."
                  )}
                </p>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
