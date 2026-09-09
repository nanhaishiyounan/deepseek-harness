import type { useTranslate } from "@refinedev/core";
export { formatDate, formatNumber } from "@/lib/table-kit";

export const ARTICLE_STATUSES = [
  { value: "draft", label: "Draft", i18nKey: "knowledge.enums.status.draft" },
  {
    value: "published",
    label: "Published",
    i18nKey: "knowledge.enums.status.published",
  },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  published: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  draft: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export const badgeClassFor = (value: string | null | undefined) =>
  BADGE_CLASSES[value ?? ""] ?? "bg-muted text-muted-foreground";

export const labelFor = (
  options: ReadonlyArray<{ value: string; label: string; i18nKey?: string }>,
  value: string | null | undefined,
  translate?: ReturnType<typeof useTranslate>
) => {
  const option = options.find((item) => item.value === value);
  if (!option) return "—";
  return option.i18nKey && translate
    ? translate(option.i18nKey, { ns: "starter" }, option.label)
    : option.label;
};

/** Split a long-text body into paragraphs for reader rendering. */
export const toParagraphs = (body: string | null | undefined): string[] =>
  (body ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
