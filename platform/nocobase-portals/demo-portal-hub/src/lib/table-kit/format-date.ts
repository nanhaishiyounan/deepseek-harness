export const formatDate = (
  value: string | null | undefined,
  locale = "en-US"
) =>
  value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(value)
      )
    : "—";
