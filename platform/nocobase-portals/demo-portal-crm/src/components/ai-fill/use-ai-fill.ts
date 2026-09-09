import { useCallback, useMemo, useRef, useState } from "react";

import {
  AIFormRegistry,
  createFormFillerInvoker,
  type AIFormField,
  type AIFormFillResult,
  type AIFormFillSkippedField,
} from "@/extensions/nocobase-ai/providers";

import {
  AiCompletionError,
  parseJsonObject,
  resolveDefaultModel,
  runAiCompletion,
  type AiModelRef,
} from "./ai-fill-client";

export type AiFillField = AIFormField;

/** Where the values that landed in the form came from. */
export type AiFillSource = "ai" | "local";

export type AiFillChange = {
  name: string;
  title: string;
  previous: unknown;
  next: unknown;
};

export type AiFillOutcome = {
  source: AiFillSource;
  changes: AiFillChange[];
  skipped: AIFormFillSkippedField[];
  /** The model's one-line explanation, when it supplied one. */
  notes?: string;
};

export type AiFillStatus = "idle" | "running" | "done" | "error";

export type UseAiFillOptions = {
  /** Stable id for the form; also the id used by the shared form-filler. */
  formId: string;
  title: string;
  fields: AiFillField[];
  getValues: () => Record<string, unknown>;
  setValues: (values: Record<string, unknown>) => void;
  /** AI employee username. Must exist on the instance. */
  employee?: string;
  model?: AiModelRef;
  /** Extra domain guidance appended to the generated prompt. */
  instructions?: string;
  /**
   * Offline classifier used when the model is unreachable, times out or returns
   * something unparseable. Its output goes through the same validation, so a
   * fallback can never write a value the form does not allow.
   */
  fallback?: (input: string) => Record<string, unknown> | undefined;
  timeoutMs?: number;
  /**
   * Extra attempts after the first. `deepseek-v4-flash` is a reasoning model and
   * intermittently spends its whole budget on reasoning tokens, returning an
   * empty `content` alongside `finish_reason: "stop"`. `max_tokens` cannot be
   * raised from here — it is not configured on the llmService and the
   * per-request `model` object does not carry it — so retrying is the only
   * lever available on the client.
   */
  retries?: number;
};

export type UseAiFillResult = {
  fill: (description: string) => Promise<void>;
  undo: () => void;
  reset: () => void;
  status: AiFillStatus;
  outcome?: AiFillOutcome;
  error?: string;
  canUndo: boolean;
};

const DEFAULT_EMPLOYEE = "form-assistant";
const DEFAULT_TIMEOUT_MS = 45_000;

const SYSTEM_MESSAGE =
  "You are a data extraction service. You never call tools. " +
  "You reply with ONLY a single minified JSON object and nothing else: " +
  "no markdown fences, no prose.";

/** Reserved key the model uses to explain itself; never a form field. */
const NOTES_KEY = "__notes";

const enumValuesOf = (field: AiFillField): unknown[] | undefined => {
  if (!Array.isArray(field.enum)) return undefined;
  return field.enum.map((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as { value?: unknown }).value
      : item
  );
};

const describeType = (field: AiFillField) => {
  switch (field.type?.toLowerCase()) {
    case "number":
    case "percent":
      return "number";
    case "integer":
      return "integer";
    case "boolean":
    case "checkbox":
      return "boolean";
    case "array":
      return "array of strings";
    case "date":
    case "dateonly":
      return "date string, format YYYY-MM-DD";
    default:
      return "string";
  }
};

export function buildAiFillPrompt({
  title,
  fields,
  current,
  description,
  instructions,
}: {
  title: string;
  fields: AiFillField[];
  current: Record<string, unknown>;
  description: string;
  instructions?: string;
}) {
  const writable = fields.filter((field) => !field.readonly);

  // The key list is spelled out because `structuredOutput.schema` is not applied
  // on this instance: a model that invents its own key names would otherwise be
  // silently dropped during validation.
  const keyList = writable
    .map((field) => `"${field.name}" (${describeType(field)})`)
    .join(", ");

  const enumLines = writable
    .flatMap((field) => {
      const values = enumValuesOf(field);
      if (!values?.length) return [];
      return [
        `- ${field.name}: ${values.map((value) => JSON.stringify(value)).join(" | ")}`,
      ];
    })
    .join("\n");

  const hintLines = writable
    .flatMap((field) =>
      field.description ? [`- ${field.name}: ${field.description}`] : []
    )
    .join("\n");

  const sections = [
    `Extract structured field values for the form "${title}" from the user's text below. Do NOT call any tool. Respond with JSON only.`,
    `Output a JSON object using exactly these keys:\n${keyList}, "${NOTES_KEY}" (string)`,
  ];
  if (enumLines) {
    sections.push(
      `Allowed values - copy one listed value verbatim:\n${enumLines}`
    );
  }
  if (hintLines) sections.push(`Field guidance:\n${hintLines}`);
  sections.push(
    [
      `- "${NOTES_KEY}": one short sentence explaining your classification.`,
      "- Omit a key entirely when its value cannot be determined from the user's text. Never invent an enum value.",
      "- Write all free text in English.",
    ].join("\n")
  );
  if (instructions) sections.push(instructions);
  sections.push(
    `The form currently holds these values. They are only defaults: replace them whenever the user's text points to a different value.\n${JSON.stringify(
      current
    )}`
  );
  sections.push(`User text:\n${description}`);

  return sections.join("\n\n");
}

export function useAiFill(options: UseAiFillOptions): UseAiFillResult {
  const {
    formId,
    title,
    fields,
    getValues,
    setValues,
    employee = DEFAULT_EMPLOYEE,
    model,
    instructions,
    fallback,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
  } = options;

  const [status, setStatus] = useState<AiFillStatus>("idle");
  const [outcome, setOutcome] = useState<AiFillOutcome | undefined>();
  const [error, setError] = useState<string | undefined>();
  const undoRef = useRef<Record<string, unknown> | undefined>(undefined);

  // Keep the callbacks current without re-running the fill on every render.
  const latest = useRef({ fields, getValues, setValues, instructions });
  latest.current = { fields, getValues, setValues, instructions };

  const cachedModel = useRef<AiModelRef | undefined>(model);

  /**
   * Validation and application both go through the shared NocoBase form filler,
   * so undeclared, read-only, wrong-typed and out-of-enum values are rejected by
   * the same rules the AI chat uses — no second, divergent implementation.
   */
  const applyThroughFormFiller = useCallback(
    async (data: Record<string, unknown>) => {
      const registry = new AIFormRegistry();
      const applied: Record<string, unknown> = {};
      const unregister = registry.register({
        id: formId,
        title,
        fields: latest.current.fields,
        getValues: () => latest.current.getValues(),
        setValues: (values) => {
          Object.assign(applied, values);
        },
      });
      try {
        const result = (await createFormFillerInvoker(registry)(
          { form: formId, data },
          {
            sessionId: "ai-fill",
            messageId: "ai-fill",
            toolCallId: "ai-fill",
            toolName: "formFiller",
            allowedFormIds: [formId],
          }
        )) as AIFormFillResult;
        return { result, applied };
      } finally {
        unregister();
      }
    },
    [formId, title]
  );

  const commit = useCallback(
    (accepted: Record<string, unknown>, source: AiFillSource, notes?: string,
     skipped: AIFormFillSkippedField[] = []) => {
      const before = latest.current.getValues();
      const titleOf = (name: string) =>
        latest.current.fields.find((field) => field.name === name)?.title ??
        name;

      const changes: AiFillChange[] = Object.entries(accepted)
        .filter(([name, value]) => before[name] !== value)
        .map(([name, value]) => ({
          name,
          title: String(titleOf(name)),
          previous: before[name],
          next: value,
        }));

      if (!changes.length) {
        setOutcome({ source, changes: [], skipped, notes });
        setStatus("done");
        return;
      }

      undoRef.current = Object.fromEntries(
        changes.map((change) => [change.name, change.previous])
      );
      latest.current.setValues(
        Object.fromEntries(changes.map((change) => [change.name, change.next]))
      );
      setOutcome({ source, changes, skipped, notes });
      setStatus("done");
    },
    []
  );

  const runFallback = useCallback(
    async (description: string, reason: string) => {
      const guess = fallback?.(description);
      if (!guess || !Object.keys(guess).length) {
        setStatus("error");
        setError(reason);
        return;
      }
      const { result, applied } = await applyThroughFormFiller(guess);
      if (result.status !== "success") {
        setStatus("error");
        setError(reason);
        return;
      }
      commit(applied, "local", undefined, result.skippedFields);
    },
    [applyThroughFormFiller, commit, fallback]
  );

  const fill = useCallback(
    async (description: string) => {
      setStatus("running");
      setError(undefined);
      setOutcome(undefined);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        cachedModel.current ??= await resolveDefaultModel();
        const resolvedModel = cachedModel.current;
        if (!resolvedModel) {
          await runFallback(description, "no-model");
          return;
        }

        const prompt = buildAiFillPrompt({
          title,
          fields: latest.current.fields,
          current: latest.current.getValues(),
          description,
          instructions: latest.current.instructions,
        });

        let parsed: Record<string, unknown> | undefined;
        let lastFailure = "unavailable";
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            const text = await runAiCompletion({
              employee,
              model: resolvedModel,
              systemMessage: SYSTEM_MESSAGE,
              prompt,
              signal: controller.signal,
            });
            parsed = parseJsonObject(text);
            if (parsed) break;
            lastFailure = "unparseable";
          } catch (cause) {
            if (controller.signal.aborted) {
              lastFailure = "timeout";
              break;
            }
            lastFailure =
              cause instanceof AiCompletionError && cause.reason === "empty"
                ? "unparseable"
                : "unavailable";
          }
        }

        if (!parsed) {
          await runFallback(description, lastFailure);
          return;
        }

        const notes =
          typeof parsed[NOTES_KEY] === "string"
            ? (parsed[NOTES_KEY] as string)
            : undefined;
        const { [NOTES_KEY]: _notes, ...data } = parsed;

        const { result, applied } = await applyThroughFormFiller(data);
        if (result.status !== "success") {
          // Nothing survived validation — an empty form beats a wrong one.
          setStatus("error");
          setError("nothing-usable");
          setOutcome({
            source: "ai",
            changes: [],
            skipped: result.skippedFields,
            notes,
          });
          return;
        }
        commit(applied, "ai", notes, result.skippedFields);
      } catch {
        await runFallback(description, "unavailable");
      } finally {
        window.clearTimeout(timer);
      }
    },
    [applyThroughFormFiller, commit, employee, retries, runFallback, timeoutMs, title]
  );

  const undo = useCallback(() => {
    const previous = undoRef.current;
    if (!previous) return;
    latest.current.setValues(previous);
    undoRef.current = undefined;
    setOutcome(undefined);
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    undoRef.current = undefined;
    setOutcome(undefined);
    setError(undefined);
    setStatus("idle");
  }, []);

  return useMemo(
    () => ({
      fill,
      undo,
      reset,
      status,
      outcome,
      error,
      canUndo: status === "done" && !!outcome?.changes.length,
    }),
    [error, fill, outcome, reset, status, undo]
  );
}
