import { useTranslate } from "@refinedev/core";
import type { Table as ReactTableInstance } from "@tanstack/react-table";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ColumnsMenu<TData>({
  table,
  labels,
  onChange,
  alwaysVisible = ["actions", "select"],
  i18nPrefix = "hr.toolkit",
}: {
  table: ReactTableInstance<TData>;
  labels: Record<string, string>;
  onChange: (hidden: string[]) => void;
  alwaysVisible?: string[];
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  const columns = table
    .getAllLeafColumns()
    .filter((column) => !alwaysVisible.includes(column.id));
  const apply = (id: string, visible: boolean) => {
    const next = new Set(
      table
        .getAllLeafColumns()
        .filter((column) => !column.getIsVisible())
        .map((column) => column.id)
    );
    if (visible) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Columns3 className="size-4" />
            {translate(`${i18nPrefix}.columns`, { ns: "starter" }, "Columns")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          {translate(
            `${i18nPrefix}.columnsHint`,
            { ns: "starter" },
            "Visible columns"
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            closeOnClick={false}
            onCheckedChange={(checked) => apply(column.id, Boolean(checked))}
          >
            {labels[column.id] ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange([])}>
          {translate(`${i18nPrefix}.showAll`, { ns: "starter" }, "Show all")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
