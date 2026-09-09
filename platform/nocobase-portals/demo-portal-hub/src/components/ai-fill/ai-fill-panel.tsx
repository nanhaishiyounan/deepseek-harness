import { useTranslate } from "@refinedev/core";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { AiFillChange, UseAiFillResult } from "./use-ai-fill";

const t = (
  translate: ReturnType<typeof useTranslate>,
  key: string,
  fallback: string,
  opts?: Record<string, unknown>
) => translate(key, { ns: "starter", ...(opts ?? {}) }, fallback);

const preview = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

function ChangeList({
  changes,
  translate,
}: {
  changes: AiFillChange[];
  translate: ReturnType<typeof useTranslate>;
}) {
  return (
    <ul className="mt-1 grid gap-1">
      {changes.map((change) => (
        <li key={change.name} className="text-xs leading-5">
          <span className="font-medium">{change.title}</span>
          <span className="text-muted-foreground">
            {": "}
            {preview(change.previous) ? (
              <>
                <span className="line-through">{preview(change.previous)}</span>
                {" → "}
              </>
            ) : null}
            <span className="text-foreground">
              {preview(change.next) ||
                t(translate, "ai.fill.emptyValue", "(empty)")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export type AiFillPanelProps = {
  ai: UseAiFillResult;
  /** Panel heading. Defaults to the shared "AI assist" label. */
  title?: string;
  description?: string;
  inputLabel: string;
  placeholder?: string;
  /** Rendered under the result block, e.g. a suggested resolution. */
  footer?: ReactNode;
};

/**
 * Describe-then-fill panel. It always states which engine produced the values
 * and lists every field it touched, so the form never changes invisibly.
 */
export function AiFillPanel({
  ai,
  title,
  description,
  inputLabel,
  placeholder,
  footer,
}: AiFillPanelProps) {
  const translate = useTranslate();
  const [input, setInput] = useState("");
  const [validation, setValidation] = useState("");

  const running = ai.status === "running";
  const changes = ai.outcome?.changes ?? [];

  const onFill = () => {
    if (!input.trim()) {
      setValidation(
        t(
          translate,
          "ai.fill.validation.describeFirst",
          "Describe what you need first, so AI assist can fill the form."
        )
      );
      return;
    }
    setValidation("");
    void ai.fill(input);
  };

  const errorMessage = (() => {
    switch (ai.error) {
      case undefined:
        return undefined;
      case "timeout":
        return t(
          translate,
          "ai.fill.error.timeout",
          "The AI assistant did not respond in time. Nothing was filled — please try again or fill the form manually."
        );
      case "no-model":
        return t(
          translate,
          "ai.fill.error.noModel",
          "No AI model is enabled on this server, so the form could not be filled automatically."
        );
      case "unparseable":
        return t(
          translate,
          "ai.fill.error.unparseable",
          "The AI assistant returned a response that could not be read. Nothing was filled."
        );
      case "nothing-usable":
        return t(
          translate,
          "ai.fill.error.nothingUsable",
          "The AI assistant did not return any value this form accepts. Nothing was filled."
        );
      default:
        return t(
          translate,
          "ai.fill.error.unavailable",
          "The AI assistant is unavailable right now. Nothing was filled — please fill the form manually."
        );
    }
  })();

  return (
    <section className="relative overflow-hidden rounded-xl border border-sky-400/35 bg-sky-50/60 p-3 dark:bg-sky-400/[0.07]">
      <div className="absolute inset-y-0 left-0 w-0.5 bg-sky-400" />
      <div className="mb-2 flex items-center gap-2 text-sky-700 dark:text-sky-200">
        <span className="grid size-6 place-items-center rounded-md bg-sky-400/15">
          <Sparkles className="size-3.5" />
        </span>
        <div>
          <div className="text-xs font-bold tracking-[0.08em] uppercase">
            {title ?? t(translate, "ai.fill.title", "AI assist")}
          </div>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      <Textarea
        aria-label={inputLabel}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={placeholder}
        disabled={running}
        className="min-h-20 border-sky-400/20 bg-background/60 text-sm"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-medium tracking-wide text-sky-700/80 uppercase dark:text-sky-200/80">
          {ai.outcome?.source === "local"
            ? t(
                translate,
                "ai.fill.mode.local",
                "Local analysis · the AI assistant was unavailable"
              )
            : ai.outcome?.source === "ai"
              ? t(
                  translate,
                  "ai.fill.mode.ai",
                  "Filled by AI · your description was sent to this server's AI assistant"
                )
              : t(
                  translate,
                  "ai.fill.mode.idle",
                  "Your description is sent to this server's AI assistant"
                )}
        </span>
        <div className="flex items-center gap-2">
          {ai.canUndo ? (
            <Button type="button" size="sm" variant="outline" onClick={ai.undo}>
              <Undo2 />
              {t(translate, "ai.fill.undo", "Undo")}
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onFill} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running
              ? t(translate, "ai.fill.analyzing", "Analyzing...")
              : t(translate, "ai.fill.action", "Fill with AI")}
          </Button>
        </div>
      </div>

      {validation ? (
        <p className="mt-2 text-xs text-red-500">{validation}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 text-xs text-red-500">{errorMessage}</p>
      ) : null}

      {ai.status === "done" ? (
        <div className="mt-3 border-t border-sky-400/20 pt-2">
          {changes.length ? (
            <>
              <div className="text-[10px] font-bold tracking-[0.08em] text-sky-700 uppercase dark:text-sky-200">
                {t(translate, "ai.fill.updatedFields", "Updated {{count}} field(s)", {
                  count: changes.length,
                })}
              </div>
              <ChangeList changes={changes} translate={translate} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(
                translate,
                "ai.fill.noChanges",
                "Nothing to change — the form already matches your description."
              )}
            </p>
          )}
          {ai.outcome?.skipped.length ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(
                translate,
                "ai.fill.skipped",
                "Ignored {{count}} value(s) this form does not accept: {{names}}",
                {
                  count: ai.outcome.skipped.length,
                  names: ai.outcome.skipped
                    .map((field) => field.name)
                    .join(", "),
                }
              )}
            </p>
          ) : null}
          {ai.outcome?.notes ? (
            <p className="mt-1 text-[11px] text-muted-foreground italic">
              {ai.outcome.notes}
            </p>
          ) : null}
        </div>
      ) : null}

      {footer}
    </section>
  );
}
