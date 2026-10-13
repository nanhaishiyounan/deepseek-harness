import { useTranslate } from "@refinedev/core";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeleteBulkButton({
  onConfirm,
  label,
  i18nPrefix = "hr.toolkit",
}: {
  onConfirm: () => void;
  label?: string;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="inline-flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="border-destructive/50 text-destructive"
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        <Check className="size-4" />
        {translate(`${i18nPrefix}.confirm`, { ns: "starter" }, "Confirm")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        {translate(`${i18nPrefix}.cancel`, { ns: "starter" }, "Cancel")}
      </Button>
    </span>
  ) : (
    <Button
      variant="outline"
      size="sm"
      className="text-destructive"
      onClick={() => setArmed(true)}
    >
      <Trash2 className="size-4" />
      {label ?? translate(`${i18nPrefix}.delete`, { ns: "starter" }, "Delete")}
    </Button>
  );
}
