import { useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { LoaderCircle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate, labelFor, toDateInputValue } from "./constants";
import { EnumBadge, useLocale } from "./shared";

export type InlineCellBase = {
  resource: string;
  id: string | number;
  field: string;
  disabled?: boolean;
};

type InlineMutationRecord = {
  id?: string | number;
  [key: string]: unknown;
};

function useInlineCellValue<T>({
  resource,
  id,
  field,
  value,
}: InlineCellBase & { value: T }) {
  const translate = useTranslate();
  const { open } = useNotification();
  const { mutate } = useUpdate<InlineMutationRecord>();
  const [displayValue, setDisplayValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const displayValueRef = useRef(value);
  const lastIncomingValueRef = useRef(value);
  const savingRef = useRef(false);

  // The prop equality gate lets the optimistic value survive unrelated list
  // renders until Refine's invalidated query supplies an actual new value.
  useEffect(() => {
    if (Object.is(lastIncomingValueRef.current, value)) return;
    lastIncomingValueRef.current = value;
    displayValueRef.current = value;
    setDisplayValue(value);
  }, [value]);

  const save = useCallback(
    (nextValue: T) => {
      if (savingRef.current || Object.is(displayValueRef.current, nextValue)) return;

      const previousValue = displayValueRef.current;
      displayValueRef.current = nextValue;
      savingRef.current = true;
      setDisplayValue(nextValue);
      setSaving(true);

      // Only the named field is included so an inline edit cannot overwrite a
      // stale value from another column in the same row.
      mutate(
        { resource, id, values: { [field]: nextValue } },
        {
          onSuccess: () => {
            savingRef.current = false;
            setSaving(false);
          },
          onError: () => {
            displayValueRef.current = previousValue;
            savingRef.current = false;
            setDisplayValue(previousValue);
            setSaving(false);
            open?.({
              type: "error",
              message: translate(
                "crm.inline.saveError",
                { ns: "starter" },
                "Could not save that change"
              ),
              description: translate(
                "crm.inline.saveErrorDescription",
                { ns: "starter" },
                "The previous value has been restored."
              ),
            });
          },
        }
      );
    },
    [field, id, mutate, open, resource, translate]
  );

  return { displayValue, save, saving };
}

function InlineRestingButton({
  children,
  disabled,
  saving,
  className,
  onEdit,
}: {
  children: ReactNode;
  disabled?: boolean;
  saving: boolean;
  className?: string;
  onEdit: () => void;
}) {
  const translate = useTranslate();
  const editHint = translate(
    "crm.inline.editHint",
    { ns: "starter" },
    "Click to edit"
  );

  return (
    <button
      type="button"
      className={cn(
        "group/inline-edit inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-sm border-b border-dashed border-muted-foreground/40 text-left outline-none transition-colors hover:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      title={disabled ? undefined : editHint}
      aria-busy={saving}
      disabled={disabled || saving}
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
      {saving ? (
        <LoaderCircle className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export function InlineEnumCell({
  resource,
  id,
  field,
  disabled,
  value,
  options,
  displayOptions = options,
  badge = false,
}: InlineCellBase & {
  value: string | null | undefined;
  options: ReadonlyArray<{ value: string; label: string; i18nKey?: string }>;
  /** Optional full enum used to label values that are intentionally not writable. */
  displayOptions?: ReadonlyArray<{
    value: string;
    label: string;
    i18nKey?: string;
  }>;
  /** Render the resting state as a coloured badge instead of plain text. */
  badge?: boolean;
}): ReactNode {
  const translate = useTranslate();
  const [editing, setEditing] = useState(false);
  const { displayValue, save, saving } = useInlineCellValue({
    resource,
    id,
    field,
    value,
  });
  const label = labelFor(displayOptions, displayValue, translate);

  if (!editing) {
    return (
      <InlineRestingButton
        disabled={disabled}
        saving={saving}
        onEdit={() => setEditing(true)}
      >
        {badge ? <EnumBadge value={displayValue} label={label} /> : label}
      </InlineRestingButton>
    );
  }

  return (
    <div
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          setEditing(false);
        }
      }}
    >
      <Select
        value={displayValue ?? null}
        defaultOpen
        disabled={disabled || saving}
        onOpenChange={(open) => {
          if (!open) setEditing(false);
        }}
        onValueChange={(nextValue) => {
          if (nextValue === null) return;
          save(nextValue);
          setEditing(false);
        }}
      >
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {labelFor(options, option.value, translate)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InlineDateCell({
  resource,
  id,
  field,
  disabled,
  value,
  isAlert,
}: InlineCellBase & {
  value: string | null | undefined;
  /** Highlights an overdue value in red when the predicate returns true. */
  isAlert?: (value: string | null | undefined) => boolean;
}): ReactNode {
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter and Escape unmount the input; ignore any blur dispatched on the way out.
  const skipBlurRef = useRef(false);
  const { displayValue, save, saving } = useInlineCellValue({
    resource,
    id,
    field,
    value,
  });

  const startEditing = useCallback(() => {
    skipBlurRef.current = false;
    setDraft(toDateInputValue(displayValue));
    setEditing(true);
  }, [displayValue]);
  const commitDraft = useCallback(() => {
    skipBlurRef.current = true;
    if (draft !== toDateInputValue(displayValue)) save(draft || null);
    setEditing(false);
  }, [displayValue, draft, save]);

  if (!editing) {
    return (
      <InlineRestingButton
        disabled={disabled}
        saving={saving}
        onEdit={startEditing}
        className={cn(
          "whitespace-nowrap",
          isAlert?.(displayValue) && "font-medium text-red-600 dark:text-red-400"
        )}
      >
        {formatDate(displayValue, locale)}
      </InlineRestingButton>
    );
  }

  return (
    <Input
      autoFocus
      type="date"
      value={draft}
      disabled={disabled || saving}
      className="w-36"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        commitDraft();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commitDraft();
        } else if (event.key === "Escape") {
          event.preventDefault();
          skipBlurRef.current = true;
          setEditing(false);
        }
      }}
    />
  );
}

export function InlineNumberCell({
  resource,
  id,
  field,
  disabled,
  value,
  min,
  step,
  format,
}: InlineCellBase & {
  value: number | null | undefined;
  min?: number;
  step?: number;
  /** Formatter used for the resting state, e.g. currency. */
  format?: (value: number | null | undefined) => string;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter and Escape unmount the input; ignore any blur dispatched on the way out.
  const skipBlurRef = useRef(false);
  const { displayValue, save, saving } = useInlineCellValue({
    resource,
    id,
    field,
    value,
  });

  const startEditing = useCallback(() => {
    skipBlurRef.current = false;
    setDraft(displayValue === null || displayValue === undefined ? "" : String(displayValue));
    setEditing(true);
  }, [displayValue]);
  const commitDraft = useCallback(() => {
    skipBlurRef.current = true;
    if (draft.trim() === "") {
      if (displayValue !== null && displayValue !== undefined) save(null);
    } else {
      const parsed = Number(draft);
      if (Number.isFinite(parsed) && !Object.is(displayValue, parsed)) {
        save(min === undefined ? parsed : Math.max(min, parsed));
      }
    }
    setEditing(false);
  }, [displayValue, draft, min, save]);

  if (!editing) {
    const formatted = format
      ? format(displayValue)
      : displayValue === null || displayValue === undefined
        ? "—"
        : String(displayValue);
    return (
      <InlineRestingButton
        disabled={disabled}
        saving={saving}
        onEdit={startEditing}
        className="justify-end tabular-nums"
      >
        {formatted}
      </InlineRestingButton>
    );
  }

  return (
    <Input
      autoFocus
      type="number"
      value={draft}
      min={min}
      step={step}
      disabled={disabled || saving}
      className="ml-auto w-28 text-right tabular-nums"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        commitDraft();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commitDraft();
        } else if (event.key === "Escape") {
          event.preventDefault();
          skipBlurRef.current = true;
          setEditing(false);
        }
      }}
    />
  );
}

export function InlineBooleanCell({
  resource,
  id,
  field,
  disabled,
  value,
  trueLabel,
  falseLabel,
}: InlineCellBase & {
  value: boolean | null | undefined;
  trueLabel: string;
  falseLabel: string;
}): ReactNode {
  const { displayValue, save, saving } = useInlineCellValue({
    resource,
    id,
    field,
    value,
  });
  const active = Boolean(displayValue);

  return (
    <InlineRestingButton
      disabled={disabled}
      saving={saving}
      onEdit={() => save(!active)}
      className={cn(
        active
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-muted-foreground"
      )}
    >
      {active ? trueLabel : falseLabel}
    </InlineRestingButton>
  );
}
