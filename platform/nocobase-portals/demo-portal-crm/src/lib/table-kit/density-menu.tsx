import { useTranslate } from "@refinedev/core";
import { Check, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Density } from "./density";

export function DensityMenu({
  value,
  onChange,
  i18nPrefix = "hr.toolkit",
}: {
  value: Density;
  onChange: (value: Density) => void;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  const options: Array<{ value: Density; label: string }> = [
    {
      value: "comfortable",
      label: translate(
        `${i18nPrefix}.density.comfortable`,
        { ns: "starter" },
        "Comfortable"
      ),
    },
    {
      value: "compact",
      label: translate(
        `${i18nPrefix}.density.compact`,
        { ns: "starter" },
        "Compact"
      ),
    },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Rows3 className="size-4" />
            {translate(`${i18nPrefix}.density`, { ns: "starter" }, "Density")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="flex-1">{option.label}</span>
            {value === option.value ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
