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
import type { ProductRecord, WarehouseRecord } from "./types";

export type PickerOption = { value: string; label: string };

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
              : placeholder ??
                translate("inventory.pickers.select", { ns: "starter" }, "Select...")}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                "inventory.pickers.search",
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
                  "inventory.pickers.noResults",
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
            "inventory.pickers.clear",
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

export function ProductPicker({
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
  const { result } = useList<ProductRecord>({
    resource: "hub_inv_products",
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
          label: product.sku
            ? `${product.name} (${product.sku})`
            : (product.name as string),
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
        "inventory.pickers.product.placeholder",
        { ns: "starter" },
        "Select a product"
      )}
      initialOption={initialOption}
    />
  );
}

export function WarehousePicker({
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
  const { result } = useList<WarehouseRecord>({
    resource: "hub_inv_warehouses",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((warehouse) => warehouse.name)
        .map((warehouse) => ({
          value: String(warehouse.id),
          label: warehouse.name as string,
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
        "inventory.pickers.warehouse.placeholder",
        { ns: "starter" },
        "Select a warehouse"
      )}
      initialOption={initialOption}
    />
  );
}
