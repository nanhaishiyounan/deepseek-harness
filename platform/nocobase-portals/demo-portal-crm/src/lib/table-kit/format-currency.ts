export const formatCurrency = (
  value: number | null | undefined,
  locale = "en-US",
  currency = "USD"
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
