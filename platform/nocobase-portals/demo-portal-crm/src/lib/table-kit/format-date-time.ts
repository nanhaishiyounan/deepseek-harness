export const formatDateTime = (
  value: string | null | undefined,
  locale = "en-US"
) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
