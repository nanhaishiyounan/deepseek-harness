import { useTranslate } from "@refinedev/core";
import { Checkbox } from "@/components/ui/checkbox";

export function RowCheckbox({
  checked,
  onCheckedChange,
  i18nPrefix = "hr.toolkit",
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(Boolean(next))}
      aria-label={translate(
        `${i18nPrefix}.selectRow`,
        { ns: "starter" },
        "Select row"
      )}
    />
  );
}
