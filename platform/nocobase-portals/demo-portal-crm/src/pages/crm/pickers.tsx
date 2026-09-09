import { useList, useTranslate } from "@refinedev/core";
import { ChevronDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  QuickCreateContactDialog,
  QuickCreateCustomerDialog,
} from "./quick-create";
import type {
  ContactRecord,
  CustomerRecord,
  DealRecord,
  ProductRecord,
  UserRecord,
} from "./types";

export type PickerOption = { value: string; label: string };

/**
 * Relation ids arrive from NocoBase as numbers (`customer_id: 378464132530176`)
 * while picker options are built as strings. Every comparison between a form
 * value and an option value has to go through this so the stored relation is
 * recognised and rendered instead of falling back to the empty placeholder.
 */
export type RelationId = string | number | null | undefined;

export const toPickerValue = (value: RelationId): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/**
 * Defensive builder for a picker's `initialOption`. Decides whether to render an
 * option by whether the relation *id* exists — not by whether the label is
 * truthy — so a saved relation whose appended object is missing or whose display
 * name is blank still selects instead of collapsing to the empty placeholder.
 * When the label is absent it falls back to `${fallbackLabel} #<id>`.
 */
export const makeInitialOption = (
  id: RelationId,
  label: string | null | undefined,
  fallbackLabel: string
): PickerOption | null => {
  const value = toPickerValue(id);
  if (value === null) return null;

  return {
    value,
    label: label?.trim() || `${fallbackLabel} #${value}`,
  };
};

export function useCustomerOptions(): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<CustomerRecord>({
    resource: "crm_customers",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "company_name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((customer) => customer.company_name)
        .map((customer) => ({
          value: String(customer.id),
          label: customer.company_name as string,
        })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

export function useOwnerOptions(): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<UserRecord>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "nickname", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((user) => user.nickname)
        .map((user) => ({
          value: String(user.id),
          label: user.nickname as string,
        })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

export function useProductOptions(): {
  options: Array<PickerOption & { product: ProductRecord }>;
  isLoading: boolean;
} {
  const { result, query } = useList<ProductRecord>({
    resource: "crm_products",
    filters: [{ field: "active", operator: "eq", value: true }],
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((product) => product.name)
        .map((product) => ({
          value: String(product.id),
          label: `${product.name} · ${product.sku ?? ""}`,
          product,
        })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

type EntityPickerProps = {
  value: RelationId;
  onChange: (value: string | null) => void;
  options: PickerOption[];
  placeholder?: string;
  disabled?: boolean;
  initialOption?: PickerOption | null;
  /** Renders a "+ Create …" row at the bottom of the option list. */
  onCreate?: (typedTerm: string) => void;
  createLabel?: string;
};

export function EntityPicker({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  initialOption,
  onCreate,
  createLabel,
}: EntityPickerProps) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const selectedValue = toPickerValue(value);

  const withInitial = useMemo(() => {
    if (
      !initialOption ||
      options.some((option) => option.value === initialOption.value)
    ) {
      return options;
    }
    return [...options, initialOption];
  }, [options, initialOption]);

  const selected =
    withInitial.find((option) => option.value === selectedValue) ?? null;

  const visible = useMemo(() => {
    const query = typed.trim().toLowerCase();
    if (!query) return withInitial;
    return withInitial.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
  }, [withInitial, typed]);

  return (
    <div className="relative">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              nativeButton={false}
              className={cn(
                "w-full justify-between font-normal",
                !selected && "text-muted-foreground"
              )}
            />
          }
        >
          <span className="truncate">
            {selected
              ? selected.label
              : placeholder ??
                translate("crm.pickers.select", { ns: "starter" }, "Select...")}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                "crm.pickers.search",
                { ns: "starter" },
                "Search..."
              )}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                {translate(
                  "crm.pickers.noResults",
                  { ns: "starter" },
                  "No results"
                )}
              </p>
            ) : (
              visible.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setTyped("");
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    selected?.value === option.value && "bg-accent"
                  )}
                >
                  {option.label}
                </button>
              ))
            )}
            {onCreate ? (
              <div className="mt-1 border-t pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const typedTerm = typed;
                    setTyped("");
                    setOpen(false);
                    onCreate(typedTerm);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-4 shrink-0" />
                  <span className="truncate">
                    {createLabel ??
                      translate(
                        "crm.pickers.create",
                        { ns: "starter" },
                        "Create"
                      )}
                    {typed.trim() ? ` "${typed.trim()}"` : ""}
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {!disabled && selectedValue ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={translate(
            "crm.pickers.clear",
            { ns: "starter" },
            "Clear selection"
          )}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function useDealOptions(customerId: RelationId): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<DealRecord>({
    resource: "crm_deals",
    filters: customerId
      ? [{ field: "customer_id", operator: "eq", value: customerId }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "createdAt", order: "desc" }],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(customerId) },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((deal) => deal.title)
        .map((deal) => ({
          value: String(deal.id),
          label: deal.title as string,
        })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

type OwnerPickerProps = {
  value: RelationId;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
};

export function OwnerPicker({
  value,
  onChange,
  disabled,
  initialOption,
}: OwnerPickerProps) {
  const translate = useTranslate();
  const { options } = useOwnerOptions();
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={translate(
        "crm.pickers.owner.placeholder",
        { ns: "starter" },
        "Assign an owner (optional)"
      )}
      initialOption={initialOption}
    />
  );
}

type DealPickerProps = {
  customerId: RelationId;
  value: RelationId;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
};

export function DealPicker({
  customerId,
  value,
  onChange,
  disabled,
  initialOption,
}: DealPickerProps) {
  const translate = useTranslate();
  const { options } = useDealOptions(customerId);
  return (
    <EntityPicker
      value={customerId ? value ?? null : null}
      onChange={onChange}
      options={options}
      disabled={disabled || !customerId}
      placeholder={
        customerId
          ? translate(
              "crm.pickers.deal.placeholder",
              { ns: "starter" },
              "Select a deal (optional)"
            )
          : translate(
              "crm.pickers.deal.customerFirst",
              { ns: "starter" },
              "Pick a customer first"
            )
      }
      initialOption={initialOption}
    />
  );
}

type CustomerPickerProps = {
  value: RelationId;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  initialOption?: PickerOption | null;
};

export function CustomerPicker({
  value,
  onChange,
  disabled,
  placeholder,
  initialOption,
}: CustomerPickerProps) {
  const translate = useTranslate();
  const { options } = useCustomerOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createdOption, setCreatedOption] = useState<PickerOption | null>(null);
  return (
    <>
      <EntityPicker
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        placeholder={
          placeholder ??
          translate(
            "crm.pickers.customer.placeholder",
            { ns: "starter" },
            "Select a customer"
          )
        }
        initialOption={createdOption ?? initialOption}
        onCreate={(typedTerm) => {
          setCreateName(typedTerm);
          setCreateOpen(true);
        }}
        createLabel={translate(
          "crm.pickers.createCustomer",
          { ns: "starter" },
          "Create a new customer"
        )}
      />
      <QuickCreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName={createName}
        onCreated={(record) => {
          setCreatedOption(
            makeInitialOption(
              record.id,
              record.company_name,
              translate("crm.common.customer", { ns: "starter" }, "Customer")
            )
          );
          onChange(String(record.id));
        }}
      />
    </>
  );
}

type ContactPickerProps = {
  customerId: RelationId;
  value: RelationId;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
};

export function ContactPicker({
  customerId,
  value,
  onChange,
  disabled,
  initialOption,
}: ContactPickerProps) {
  const translate = useTranslate();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createdOption, setCreatedOption] = useState<PickerOption | null>(null);
  const { result } = useList<ContactRecord>({
    resource: "crm_contacts",
    filters: customerId
      ? [{ field: "customer_id", operator: "eq", value: customerId }]
      : [],
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false, enabled: Boolean(customerId) },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((contact) => contact.name)
        .map((contact) => ({
          value: String(contact.id),
          label: contact.name as string,
        })),
    [result.data]
  );

  return (
    <>
      <EntityPicker
        value={customerId ? value ?? null : null}
        onChange={onChange}
        options={options}
        disabled={disabled || !customerId}
        placeholder={
          customerId
            ? translate(
                "crm.pickers.contact.placeholder",
                { ns: "starter" },
                "Select a contact (optional)"
              )
            : translate(
                "crm.pickers.contact.customerFirst",
                { ns: "starter" },
                "Pick a customer first"
              )
        }
        initialOption={createdOption ?? initialOption}
        onCreate={
          customerId
            ? (typedTerm) => {
                setCreateName(typedTerm);
                setCreateOpen(true);
              }
            : undefined
        }
        createLabel={translate(
          "crm.pickers.createContact",
          { ns: "starter" },
          "Create a new contact"
        )}
      />
      {customerId ? (
        <QuickCreateContactDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          customerId={customerId}
          initialName={createName}
          onCreated={(record) => {
            setCreatedOption(
              makeInitialOption(
                record.id,
                record.name,
                translate("crm.common.contact", { ns: "starter" }, "Contact")
              )
            );
            onChange(String(record.id));
          }}
        />
      ) : null}
    </>
  );
}
