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
import type { DepartmentRecord, EmployeeRecord } from "./types";

export type PickerOption = { value: string; label: string };

export function useDepartmentOptions(): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<DepartmentRecord>({
    resource: "hub_hr_departments",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter((dept) => dept.name)
        .map((dept) => ({
          value: String(dept.id),
          label: dept.name as string,
        })),
    [result.data]
  );
  return { options, isLoading: query.isLoading };
}

export function useEmployeeOptions(excludeId?: string | number | null): {
  options: PickerOption[];
  isLoading: boolean;
} {
  const { result, query } = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const options = useMemo(
    () =>
      result.data
        .filter(
          (emp) => emp.name && String(emp.id) !== String(excludeId ?? "")
        )
        .map((emp) => ({
          value: String(emp.id),
          label: emp.job_title
            ? `${emp.name} · ${emp.job_title}`
            : (emp.name as string),
        })),
    [result.data, excludeId]
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
                translate("hr.picker.select", { ns: "starter" }, "Select...")}
          </span>
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate("hr.picker.search", { ns: "starter" }, "Search...")}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                {translate("hr.picker.noResults", { ns: "starter" }, "No results")}
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
          aria-label={translate("hr.picker.clear", { ns: "starter" }, "Clear selection")}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function DepartmentPicker({
  value,
  onChange,
  disabled,
  placeholder,
  initialOption,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  initialOption?: PickerOption | null;
}) {
  const translate = useTranslate();
  const { options } = useDepartmentOptions();
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={
        placeholder ??
        translate("hr.picker.selectDepartment", { ns: "starter" }, "Select a department")
      }
      initialOption={initialOption}
    />
  );
}

export function EmployeePicker({
  value,
  onChange,
  disabled,
  placeholder,
  excludeId,
  initialOption,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  excludeId?: string | number | null;
  initialOption?: PickerOption | null;
}) {
  const translate = useTranslate();
  const { options } = useEmployeeOptions(excludeId);
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={
        placeholder ??
        translate("hr.picker.selectEmployee", { ns: "starter" }, "Select an employee")
      }
      initialOption={initialOption}
    />
  );
}
