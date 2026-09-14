import { useList, useTranslate } from "@refinedev/core";
import { ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { flattenForSelect, useCategoryTree } from "./category-tree";
import type { UserRef } from "./types";

export type PickerOption = { value: string; label: string };

/** Indented native <select> of the whole category tree. */
export function CategoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const translate = useTranslate();
  const { tree } = useCategoryTree();
  const untitled = translate(
    "knowledge.common.untitled",
    { ns: "starter" },
    "Untitled"
  );
  const options = useMemo(
    () => flattenForSelect(tree, untitled),
    [tree, untitled]
  );
  return (
    <NativeSelect
      className="w-full"
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <NativeSelectOption value="">
        {translate("knowledge.pickers.uncategorized", { ns: "starter" }, "Uncategorized")}
      </NativeSelectOption>
      {options.map((option) => (
        <NativeSelectOption key={option.id} value={option.id}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function useAuthorOptions(): PickerOption[] {
  const { result } = useList<UserRef>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "nickname", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  return useMemo(
    () =>
      (result.data ?? [])
        .filter((user) => user.nickname)
        .map((user) => ({
          value: String(user.id),
          label: user.nickname as string,
        })),
    [result.data]
  );
}

/** Searchable popover picker for the article author (a user). */
export function AuthorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const translate = useTranslate();
  const options = useAuthorOptions();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const selected = options.find((option) => option.value === value) ?? null;
  const visible = useMemo(() => {
    const query = typed.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
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
              : translate(
                  "knowledge.pickers.author.placeholder",
                  { ns: "starter" },
                  "Select an author"
                )}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                "knowledge.pickers.author.search",
                { ns: "starter" },
                "Search people..."
              )}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                {translate("knowledge.pickers.noResults", { ns: "starter" }, "No results")}
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
          aria-label={translate("knowledge.pickers.clear", { ns: "starter" }, "Clear")}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
