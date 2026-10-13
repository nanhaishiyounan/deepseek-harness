import { useTranslate } from "@refinedev/core";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ErrorState({
  onRetry,
  title,
  description,
  i18nPrefix = "hr.toolkit",
}: {
  onRetry?: () => void;
  title?: string;
  description?: string;
  i18nPrefix?: string;
}) {
  const translate = useTranslate();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertTriangle className="size-8 text-destructive/70" />
        <p className="text-sm font-medium">
          {title ??
            translate(
              `${i18nPrefix}.error.title`,
              { ns: "starter" },
              "Something went wrong"
            )}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {description ??
            translate(
              `${i18nPrefix}.error.description`,
              { ns: "starter" },
              "The data could not be loaded. Check your connection and try again."
            )}
        </p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {translate(`${i18nPrefix}.retry`, { ns: "starter" }, "Retry")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
