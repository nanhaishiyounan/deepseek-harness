import { nocobaseClient } from "@nocobase/portal-sdk/client";

/**
 * NocoBase resolves `$nDate` variables for every AI system prompt and reads the
 * caller's zone from `x-timezone`. A missing header arrives as an empty string,
 * which makes the server's `utcOffset("")` return a number instead of a dayjs
 * instance and every AI call fails with `m.startOf is not a function`. The
 * header must therefore be a numeric offset such as `+08:00`; IANA zone names
 * ("Asia/Shanghai") fail the same way.
 */
export function timezoneOffsetHeader(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const aiHeaders = () => ({ "x-timezone": timezoneOffsetHeader() });

export type AiModelRef = { llmService: string; model: string };

type LangChainMessage = {
  id?: string[];
  kwargs?: {
    content?: unknown;
    response_metadata?: { finish_reason?: string };
    usage_metadata?: {
      output_token_details?: { reasoning?: number };
    };
  };
};

/** The first enabled model on the instance, used when a caller names none. */
export async function resolveDefaultModel(): Promise<AiModelRef | undefined> {
  const services = await nocobaseClient.action<
    Array<{
      llmService: string;
      enabledModels?: Array<{ value: string }>;
    }>
  >("ai", "listAllEnabledModels", { headers: aiHeaders() });
  for (const service of services ?? []) {
    const model = service.enabledModels?.[0]?.value;
    if (service.llmService && model) {
      return { llmService: service.llmService, model };
    }
  }
  return undefined;
}

export async function isAiEmployeeAvailable(username: string) {
  const employees = await nocobaseClient.action<Array<{ username?: string }>>(
    "aiEmployees",
    "listByUser",
    { headers: aiHeaders() }
  );
  return (employees ?? []).some((employee) => employee?.username === username);
}

export type AiCompletionOptions = {
  employee: string;
  model: AiModelRef;
  systemMessage: string;
  prompt: string;
  signal?: AbortSignal;
};

export class AiCompletionError extends Error {
  constructor(
    message: string,
    readonly reason: "empty" | "transport"
  ) {
    super(message);
    this.name = "AiCompletionError";
  }
}

/**
 * One-shot, non-streaming completion.
 *
 * A throwaway conversation is created, used for a single turn and destroyed, so
 * repeated form fills never accumulate chat history. `skillSettings` is emptied
 * because otherwise the model answers a "fill this form" style prompt by
 * emitting a `formFiller` tool call — the request then finishes with
 * `finish_reason: "tool_calls"` and an empty `content`.
 */
export async function runAiCompletion({
  employee,
  model,
  systemMessage,
  prompt,
  signal,
}: AiCompletionOptions): Promise<string> {
  const skillSettings = { tools: [], skills: [] };
  const created = await nocobaseClient.action<{ sessionId: string }>(
    "aiConversations",
    "create",
    {
      headers: aiHeaders(),
      signal,
      body: {
        aiEmployee: { username: employee },
        systemMessage,
        skillSettings,
        modelSettings: model,
      },
    }
  );
  const sessionId = created?.sessionId;
  if (!sessionId) {
    throw new AiCompletionError("No AI session was created.", "transport");
  }

  try {
    const response = await nocobaseClient.action<{
      messages?: LangChainMessage[];
    }>("aiConversations", "sendMessages", {
      headers: aiHeaders(),
      signal,
      body: {
        sessionId,
        aiEmployee: employee,
        stream: false,
        model,
        systemMessage,
        skillSettings,
        messages: [
          {
            key: crypto.randomUUID(),
            role: "user",
            content: { type: "text", content: prompt },
          },
        ],
      },
    });

    // `sendMessages` echoes the whole thread; the answer is the last AIMessage.
    const answer = [...(response?.messages ?? [])]
      .reverse()
      .find((message) => message?.id?.at(-1) === "AIMessage");
    const content = answer?.kwargs?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) {
      // Reasoning models sometimes spend the whole budget on reasoning tokens
      // and return an empty string while still reporting `finish_reason: stop`.
      const reasoning =
        answer?.kwargs?.usage_metadata?.output_token_details?.reasoning;
      throw new AiCompletionError(
        `The model returned no content (finish_reason=${
          answer?.kwargs?.response_metadata?.finish_reason ?? "unknown"
        }, reasoning_tokens=${reasoning ?? "unknown"}).`,
        "empty"
      );
    }
    return text;
  } finally {
    // Best effort: a leaked session is harmless, a thrown cleanup error is not.
    void nocobaseClient
      .action("aiConversations", "destroy", {
        method: "DELETE",
        query: { filterByTk: sessionId },
        headers: aiHeaders(),
      })
      .catch(() => undefined);
  }
}

/**
 * Models wrap JSON in prose or fences often enough that a bare `JSON.parse` is
 * unreliable; fall back to the outermost brace-delimited span.
 */
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(text);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}
