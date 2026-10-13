import { useTranslate } from "@refinedev/core";
import { Check, Save, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { QuerySavedView } from "./use-saved-views";

export function SavedViewBar({
  presets,
  views,
  activeKey,
  onApply,
  onSave,
  onDelete,
  canSave = true,
  i18nPrefix = "hr.toolkit",
}: {
  presets: Array<{ key: string; label: string; query: string }>;
  views: QuerySavedView[];
  activeKey: string | null;
  onApply: (query: string, key: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  canSave?: boolean;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const commit = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
    setNaming(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => onApply(preset.query, preset.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            activeKey === preset.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/70 text-muted-foreground hover:text-foreground"
          )}
        >
          {preset.label}
        </button>
      ))}
      {views.map((view) => (
        <span
          key={view.id}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border py-1 pr-1.5 pl-3 text-xs font-medium transition-colors",
            activeKey === view.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/70 text-muted-foreground hover:text-foreground"
          )}
        >
          <button type="button" onClick={() => onApply(view.query, view.id)}>
            {view.name}
          </button>
          <button
            type="button"
            onClick={() => onDelete(view.id)}
            aria-label={translate(
              `${i18nPrefix}.deleteView`,
              { ns: "starter" },
              "Delete view"
            )}
            className="opacity-50 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {canSave ? (
        naming ? (
          <span className="inline-flex items-center gap-1">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setNaming(false);
              }}
              placeholder={translate(
                `${i18nPrefix}.viewName`,
                { ns: "starter" },
                "View name"
              )}
              className="h-7 w-36 text-xs"
            />
            <Button size="sm" className="h-7" onClick={commit}>
              <Check className="size-3.5" />
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setNaming(true)}
          >
            <Save className="size-3.5" />
            {translate(
              `${i18nPrefix}.saveView`,
              { ns: "starter" },
              "Save view"
            )}
          </Button>
        )
      ) : null}
    </div>
  );
}
