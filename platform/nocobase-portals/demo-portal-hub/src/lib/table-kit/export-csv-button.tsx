import { useTranslate } from "@refinedev/core";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportCsvButton({
  onExport,
  i18nPrefix = "hr.toolkit",
}: {
  onExport: () => void;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  return (
    <Button variant="outline" size="sm" onClick={onExport}>
      <Download className="size-4" />
      {translate(`${i18nPrefix}.export`, { ns: "starter" }, "Export CSV")}
    </Button>
  );
}
