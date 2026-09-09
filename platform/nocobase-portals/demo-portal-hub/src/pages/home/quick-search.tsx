import { useGetLocale, useList, useTranslate } from "@refinedev/core";
import {
  BookOpen,
  Building2,
  ContactRound,
  FolderKanban,
  Handshake,
  LifeBuoy,
  ReceiptText,
  Search,
  UserPlus,
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

type RecordId = string | number;

type AccountRecord = {
  id: RecordId;
  name?: string | null;
  industry?: string | null;
};

type ContactRecord = {
  id: RecordId;
  name?: string | null;
  email?: string | null;
};

type DealRecord = {
  id: RecordId;
  title?: string | null;
  stage?: string | null;
  amount?: number | string | null;
};

type LeadRecord = {
  id: RecordId;
  name?: string | null;
  company?: string | null;
};

type TicketRecord = {
  id: RecordId;
  subject?: string | null;
  status?: string | null;
  priority?: string | null;
};

type ProjectRecord = {
  id: RecordId;
  name?: string | null;
  code?: string | null;
  status?: string | null;
};

type InvoiceRecord = {
  id: RecordId;
  invoice_number?: string | null;
  client_name?: string | null;
  amount?: number | string | null;
};

type ArticleRecord = {
  id: RecordId;
  title?: string | null;
  summary?: string | null;
};

type SearchResult = {
  id: string;
  label: string;
  secondary: string;
  to: string;
};

type SearchGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  results: SearchResult[];
};

export function QuickSearchTrigger({ onOpen }: { onOpen: () => void }) {
  const translate = useTranslate();

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full max-w-80 justify-start text-muted-foreground"
      onClick={onOpen}
    >
      <Search />
      <span className="truncate">
        {translate(
          "home.search.placeholder",
          "Search accounts, deals, tickets…"
        )}
      </span>
      <Kbd className="ml-auto">⌘K</Kbd>
    </Button>
  );
}

export function QuickSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const translate = useTranslate();
  const getLocale = useGetLocale();
  const navigate = useNavigate();
  const locale = getLocale() || "en-US";
  const enumLabel = useEnumLabel();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        onOpenChange(true);
        return;
      }

      const target = event.target;
      const isEditable =
        target instanceof Element &&
        Boolean(target.closest("input, textarea, [contenteditable]"));
      const hasModifier =
        event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

      if (event.key === "/" && !isEditable && !hasModifier) {
        event.preventDefault();
        onOpenChange(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const { result: accounts, query: accountsQuery } = useList<AccountRecord>({
    resource: "hub_sales_accounts",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "name",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: contacts, query: contactsQuery } = useList<ContactRecord>({
    resource: "hub_sales_contacts",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "name",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: deals, query: dealsQuery } = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "title",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: leads, query: leadsQuery } = useList<LeadRecord>({
    resource: "hub_sales_leads",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "name",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: tickets, query: ticketsQuery } = useList<TicketRecord>({
    resource: "hub_hd_tickets",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "subject",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: projects, query: projectsQuery } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "name",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: invoices, query: invoicesQuery } = useList<InvoiceRecord>({
    resource: "hub_fin_invoices",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "invoice_number",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });
  const { result: articles, query: articlesQuery } = useList<ArticleRecord>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    filters: [
      {
        field: "title",
        operator: "contains",
        value: debouncedQuery.trim(),
      },
    ],
    errorNotification: false,
    queryOptions: {
      retry: false,
      enabled: debouncedQuery.trim().length >= 2,
    },
  });

  const groups: SearchGroup[] = [
    {
      id: "accounts",
      label: translate("home.search.groups.accounts", "Accounts"),
      icon: Building2,
      tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      results: accounts.data.map((record) => ({
        id: String(record.id),
        label: record.name || "—",
        secondary: joinSecondary([enumLabel(record.industry)]),
        to: `/accounts/show/${record.id}`,
      })),
    },
    {
      id: "contacts",
      label: translate("home.search.groups.contacts", "Contacts"),
      icon: ContactRound,
      tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      results: contacts.data.map((record) => ({
        id: String(record.id),
        label: record.name || "—",
        secondary: joinSecondary([record.email]),
        to: `/contacts/show/${record.id}`,
      })),
    },
    {
      id: "deals",
      label: translate("home.search.groups.deals", "Deals"),
      icon: Handshake,
      tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      results: deals.data.map((record) => ({
        id: String(record.id),
        label: record.title || "—",
        secondary: joinSecondary([
          enumLabel(record.stage),
          formatAmount(record.amount, locale),
        ]),
        to: `/deals/show/${record.id}`,
      })),
    },
    {
      id: "leads",
      label: translate("home.search.groups.leads", "Leads"),
      icon: UserPlus,
      tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      results: leads.data.map((record) => ({
        id: String(record.id),
        label: record.name || "—",
        secondary: joinSecondary([record.company]),
        to: `/leads/show/${record.id}`,
      })),
    },
    {
      id: "tickets",
      label: translate("home.search.groups.tickets", "Tickets"),
      icon: LifeBuoy,
      tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
      results: tickets.data.map((record) => ({
        id: String(record.id),
        label: record.subject || "—",
        secondary: joinSecondary([
          enumLabel(record.status),
          enumLabel(record.priority),
        ]),
        to: `/tickets/show/${record.id}`,
      })),
    },
    {
      id: "projects",
      label: translate("home.search.groups.projects", "Projects"),
      icon: FolderKanban,
      tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
      results: projects.data.map((record) => ({
        id: String(record.id),
        label: record.name || "—",
        secondary: joinSecondary([record.code, enumLabel(record.status)]),
        to: `/projects/show/${record.id}`,
      })),
    },
    {
      id: "invoices",
      label: translate("home.search.groups.invoices", "Invoices"),
      icon: ReceiptText,
      tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      results: invoices.data.map((record) => ({
        id: String(record.id),
        label: record.invoice_number || "—",
        secondary: joinSecondary([
          record.client_name,
          formatAmount(record.amount, locale),
        ]),
        to: `/invoices/show/${record.id}`,
      })),
    },
    {
      id: "articles",
      label: translate("home.search.groups.articles", "Articles"),
      icon: BookOpen,
      tone: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
      results: articles.data.map((record) => ({
        id: String(record.id),
        label: record.title || "—",
        secondary: joinSecondary([record.summary]),
        to: `/articles/show/${record.id}`,
      })),
    },
  ];

  const canSearch = debouncedQuery.trim().length >= 2;
  const isLoading =
    accountsQuery.isFetching ||
    contactsQuery.isFetching ||
    dealsQuery.isFetching ||
    leadsQuery.isFetching ||
    ticketsQuery.isFetching ||
    projectsQuery.isFetching ||
    invoicesQuery.isFetching ||
    articlesQuery.isFetching;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
      setDebouncedQuery("");
    }
    onOpenChange(nextOpen);
  };

  const selectResult = (to: string) => {
    handleOpenChange(false);
    navigate(to);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={translate("home.search.title", "Global search")}
      description={translate(
        "home.search.description",
        "Search records across the business hub."
      )}
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={translate(
            "home.search.placeholder",
            "Search accounts, deals, tickets…"
          )}
        />
        <CommandList>
          {!canSearch ? (
            <p className="px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
              {translate(
                "home.search.hint",
                "Search accounts, contacts, deals, leads, tickets, projects, invoices and articles."
              )}
            </p>
          ) : isLoading ? (
            <div
              className="space-y-2 p-3"
              aria-label={translate("home.search.loading", "Searching")}
            >
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-1 py-1">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <CommandEmpty>
                {translate("home.search.empty", "No matching records found.")}
              </CommandEmpty>
              {groups.map((group) =>
                group.results.length > 0 ? (
                  <SearchResultGroup
                    key={group.id}
                    group={group}
                    onSelect={selectResult}
                  />
                ) : null
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function SearchResultGroup({
  group,
  onSelect,
}: {
  group: SearchGroup;
  onSelect: (to: string) => void;
}) {
  const Icon = group.icon;

  return (
    <CommandGroup heading={group.label}>
      {group.results.map((result) => (
        <CommandItem
          key={result.id}
          value={`${group.id}:${result.id}`}
          className="items-start py-2"
          onSelect={() => onSelect(result.to)}
        >
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${group.tone}`}
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-normal">{result.label}</span>
            {result.secondary ? (
              <span className="block truncate text-xs text-muted-foreground">
                {result.secondary}
              </span>
            ) : null}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function joinSecondary(
  values: Array<string | number | null | undefined>
): string {
  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(String)
    .join(" · ");
}

/**
 * Enum values arrive as raw codes (`inquiry`, `on_hold`, `med`). Each module
 * owns its own label table, and Overview must not import across modules, so the
 * handful of codes this palette can actually render are translated here and
 * anything unmapped falls back to a humanised form rather than leaking snake_case.
 */
const ENUM_LABEL_KEYS: Record<string, string> = {
  // deal stage
  inquiry: "home.enum.inquiry",
  quote: "home.enum.quote",
  negotiation: "home.enum.negotiation",
  won: "home.enum.won",
  lost: "home.enum.lost",
  // ticket + project status
  open: "home.enum.open",
  pending: "home.enum.pending",
  resolved: "home.enum.resolved",
  closed: "home.enum.closed",
  active: "home.enum.active",
  planning: "home.enum.planning",
  on_hold: "home.enum.onHold",
  done: "home.enum.done",
  // priority
  low: "home.enum.low",
  med: "home.enum.med",
  high: "home.enum.high",
  urgent: "home.enum.urgent",
};

const humanize = (value: string) =>
  value.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());

function useEnumLabel() {
  const translate = useTranslate();
  return (value: string | null | undefined) => {
    if (!value) return null;
    const key = ENUM_LABEL_KEYS[value];
    return key ? translate(key, humanize(value)) : humanize(value);
  };
}

function formatAmount(
  value: number | string | null | undefined,
  locale: string
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
