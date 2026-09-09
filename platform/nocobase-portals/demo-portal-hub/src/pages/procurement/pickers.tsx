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
import type { OwnerRef, SupplierRecord } from "./types";

export type PickerOption = { value: string; label: string };

export function useSupplierOptions(): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<SupplierRecord>({
    resource: "hub_po_suppliers",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((supplier) => supplier.name)
        .map((supplier) => ({
          value: String(supplier.id),
          label: supplier.name as string,
        })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

export function useOwnerOptions(): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<OwnerRef>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "nickname", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data.map((user) => ({
        value: String(user.id),
        label: user.nickname || user.username || `User #${user.id}`,
      })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

type EntityPickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: PickerOption[];
  placeholder?: string;
  disabled?: boolean;
  initialOption?: PickerOption | null;
};

export function EntityPicker({
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

  const selectedValue = value == null ? null : String(value);
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
              : (placeholder ??
                translate("procurement.pickers.select", { ns: "starter" }, "Select..."))}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                "procurement.pickers.search",
                { ns: "starter" },
                "Search..."
              )}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                {translate("procurement.pickers.noResults", { ns: "starter" }, "No results")}
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
                    selectedValue === option.value && "bg-accent"
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
            "procurement.pickers.clear",
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

type PickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  initialOption?: PickerOption | null;
};

export function SupplierPicker({
  value,
  onChange,
  disabled,
  initialOption,
}: PickerProps) {
  const translate = useTranslate();
  const { options } = useSupplierOptions();
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={translate(
        "procurement.pickers.supplier.placeholder",
        { ns: "starter" },
        "Select a supplier"
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
}: PickerProps) {
  const translate = useTranslate();
  const { options } = useOwnerOptions();
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={translate(
        "procurement.pickers.owner.placeholder",
        { ns: "starter" },
        "Assign an owner (optional)"
      )}
      initialOption={initialOption}
    />
  );
}
