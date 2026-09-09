import { useDeleteMany, useTranslate, useUpdateMany } from "@refinedev/core";
import { ChevronDown, Loader2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** A "set this field on every selected row" action, e.g. Stage → Negotiation. */
export type BulkFieldAction = {
  field: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

type BulkBarProps = {
  resource: string;
  selected: Array<string | number>;
  onClear: () => void;
  onDone: () => void;
  fieldActions?: BulkFieldAction[];
  canDelete?: boolean;
};

/**
 * Floating action bar shown while rows are selected — mirrors the Salesforce
 * list-view mass-update behaviour (change a field on many records, or delete),
 * with an explicit confirmation on the destructive path.
 */
export function BulkBar({
  resource,
  selected,
  onClear,
  onDone,
  fieldActions = [],
  canDelete = true,
}: BulkBarProps) {
  const translate = useTranslate();
  const { mutate: updateMany, mutation: updateState } = useUpdateMany();
  const { mutate: deleteMany, mutation: deleteState } = useDeleteMany();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = updateState.isPending || deleteState.isPending;

  if (selected.length === 0) return null;

  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg">
      <span className="text-sm font-medium">
        {translate(
          "sales.bulk.selected",
          { ns: "starter" },
          "{{count}} selected"
        ).replace("{{count}}", String(selected.length))}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={onClear}>
        <X />
      </Button>

      <div className="h-5 w-px bg-border" />

      {fieldActions.map((action) => (
        <Popover key={action.field}>
          <PopoverTrigger
            render={<Button variant="outline" size="sm" disabled={busy} />}
          >
            {action.label}
            <ChevronDown />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-1">
            {action.options.map((option) => (
              <button
                key={option.value}
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() =>
                  updateMany(
                    {
                      resource,
                      ids: selected,
                      values: { [action.field]: option.value },
                    },
                    { onSuccess: onDone }
                  )
                }
              >
                {option.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ))}

      {canDelete ? (
        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger
            render={
              <Button variant="destructive" size="sm" disabled={busy} />
            }
          >
            <Trash2 />
            {translate("sales.bulk.delete", { ns: "starter" }, "Delete")}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3">
            <p className="text-sm">
              {translate(
                "sales.bulk.deleteConfirm",
                { ns: "starter" },
                "Delete {{count}} records? This can't be undone."
              ).replace("{{count}}", String(selected.length))}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  deleteMany(
                    { resource, ids: selected },
                    {
                      onSuccess: () => {
                        setConfirmOpen(false);
                        onDone();
                      },
                    }
                  )
                }
              >
                {translate("sales.bulk.deleteAction", { ns: "starter" }, "Delete")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {busy ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
