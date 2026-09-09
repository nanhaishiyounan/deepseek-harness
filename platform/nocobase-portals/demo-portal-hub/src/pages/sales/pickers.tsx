import { useList, useTranslate } from "@refinedev/core";
import { ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AccountRecord, DealRecord, UserRef } from "./types";

export type PickerOption = { value: string; label: string };

type EntityPickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: PickerOption[];
  placeholder?: string;
  disabled?: boolean;
  initialOption?: PickerOption | null;
};

function EntityPicker({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  initialOption,
}: EntityPickerProps) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const withInitial = useMemo(() => {
    if (
      !initialOption ||
      options.some((option) => option.value === initialOption.value)
    ) {
      return options;
    }
    return [...options, initialOption];
  }, [options, initialOption]);

  const selected = withInitial.find((option) => option.value === value) ?? null;

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
              : (placeholder ??
                translate("sales.pickers.select", { ns: "starter" }, "Select..."))}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                "sales.pickers.search",
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
                  "sales.pickers.noResults",
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
          </div>
        </PopoverContent>
      </Popover>
      {!disabled && value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={translate(
            "sales.pickers.clear",
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

const userLabel = (user: UserRef) =>
  user.nickname || user.username || `User #${user.id}`;

export function AccountPicker({
  value,
  onChange,
  disabled,
  initialOption,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
}) {
  const translate = useTranslate();
  const { result } = useList<AccountRecord>({
    resource: "hub_sales_accounts",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((account) => account.name)
        .map((account) => ({
          value: String(account.id),
          label: account.name as string,
        })),
    [result.data]
  );
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={translate(
        "sales.pickers.account.placeholder",
        { ns: "starter" },
        "Select an account"
      )}
      initialOption={initialOption}
    />
  );
}

export function DealPicker({
  value,
  onChange,
  disabled,
  initialOption,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
}) {
  const translate = useTranslate();
  const { result } = useList<DealRecord>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "createdAt", order: "desc" }],
    errorNotification: false,
    queryOptions: { retry: false },
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
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={translate(
        "sales.pickers.deal.placeholder",
        { ns: "starter" },
        "Select a deal"
      )}
      initialOption={initialOption}
    />
  );
}

export function OwnerPicker({
  value,
  onChange,
  disabled,
  initialOption,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
}) {
  const translate = useTranslate();
  const { result } = useList<UserRef>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "id", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data.map((user) => ({
        value: String(user.id),
        label: userLabel(user),
      })),
    [result.data]
  );
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={translate(
        "sales.pickers.owner.placeholder",
        { ns: "starter" },
        "Assign an owner"
      )}
      initialOption={initialOption}
    />
  );
}
