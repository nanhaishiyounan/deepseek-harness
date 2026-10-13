import { useTranslate } from "@refinedev/core";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  className,
  i18nPrefix = "hr.toolkit",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={
          placeholder ??
          translate(`${i18nPrefix}.search`, { ns: "starter" }, "Search...")
        }
        className="pl-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={translate(
            `${i18nPrefix}.clear`,
            { ns: "starter" },
            "Clear"
          )}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
