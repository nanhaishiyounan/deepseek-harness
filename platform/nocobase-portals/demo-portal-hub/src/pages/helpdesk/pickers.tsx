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
import type { UserRef } from "./types";

export type PickerOption = { value: string; label: string };

export function useUserOptions(): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<UserRef>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "id", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data.map((user) => ({
        value: String(user.id),
        label: user.nickname || user.username || user.email || `User #${user.id}`,
      })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

type UserPickerProps = {
  value: number | string | null | undefined;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
};

export function UserPicker({
  value,
  onChange,
  disabled,
  placeholder,
  allowClear = true,
}: UserPickerProps) {
  const translate = useTranslate();
  const { options } = useUserOptions();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const current = value == null ? null : String(value);
  const selected = options.find((option) => option.value === current) ?? null;

  const visible = useMemo(() => {
    const q = typed.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, typed]);

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
              : placeholder ?? translate("buttons.select", "Select...")}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate("buttons.search", "Search...")}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                {translate("table.noResults", "No results")}
              </p>
            ) : (
              visible.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(Number(option.value));
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
      {allowClear && !disabled && current ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={translate("buttons.clear", "Clear")}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
