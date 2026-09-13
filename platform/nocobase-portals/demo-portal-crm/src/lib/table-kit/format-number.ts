export const formatNumber = (
  value: number | null | undefined,
  locale = "en-US"
) => new Intl.NumberFormat(locale).format(Number(value ?? 0));
