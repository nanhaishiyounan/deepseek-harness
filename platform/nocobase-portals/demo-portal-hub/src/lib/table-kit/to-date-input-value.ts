export const toDateInputValue = (value: string | null | undefined) =>
  value ? String(value).slice(0, 10) : "";
