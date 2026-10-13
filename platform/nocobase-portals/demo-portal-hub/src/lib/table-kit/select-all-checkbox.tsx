import { useTranslate } from "@refinedev/core";
import type { Table as ReactTableInstance } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";

type ControlledSelectAllProps = {
  table?: never;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  i18nPrefix?: string;
};

type TableSelectAllProps<TData> = {
  table: ReactTableInstance<TData>;
  checked?: never;
  indeterminate?: never;
  onChange?: never;
  label?: string;
  i18nPrefix?: string;
};

export function SelectAllCheckbox<TData>(
  props: ControlledSelectAllProps | TableSelectAllProps<TData>
) {
  const translate = useTranslate();
  if (props.table) {
    const all = props.table.getIsAllPageRowsSelected();
    const some = props.table.getIsSomePageRowsSelected();
    const prefix = props.i18nPrefix ?? "hr.toolkit";
    return (
      <Checkbox
        checked={all}
        indeterminate={some && !all}
        onCheckedChange={(checked) =>
          props.table.toggleAllPageRowsSelected(Boolean(checked))
        }
        aria-label={
          props.label ??
          translate(`${prefix}.selectAll`, { ns: "starter" }, "Select all rows")
        }
      />
    );
  }

  return (
    <Checkbox
      aria-label={props.label}
      checked={props.checked}
      indeterminate={props.indeterminate}
      onCheckedChange={(value) => props.onChange(Boolean(value))}
    />
  );
}
