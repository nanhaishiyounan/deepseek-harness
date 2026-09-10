import { useTranslate } from "@refinedev/core";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  AIChatWindow,
  ChatInline,
  useAIPageElement,
} from "@/extensions/nocobase-ai/components";
import { AIEmployeeAvatar } from "@/extensions/nocobase-ai/components/chat/ai-employee-avatar";
import {
  AIChatProvider,
  createAIPageContextReference,
  useAI,
  useAIChatBase,
  useAIChatController,
  useAIChatControllerState,
  useAIChatMessages,
  useAIChatStatus,
  useAIFormRegistry,
  type AIChatMessage,
  type AIFormField,
} from "@/extensions/nocobase-ai/providers";
import {
  getNocoBaseToolMetadata,
  isAIToolPart,
} from "@/extensions/nocobase-ai/providers/chat-message-utils";
import { X } from "lucide-react";

/**
 * Username of the AI employee that backs every form-fill panel. `dex` ships
 * with plugin-ai, is already localized on this instance, and is the same
 * employee the admin-side v2 Add-new popups use (N18).
 */
const FORM_FILL_EMPLOYEE = "dex";

const getToolPartName = (part: AIChatMessage["parts"][number]) =>
  part.type === "dynamic-tool"
    ? part.toolName
    : part.type.startsWith("tool-")
      ? part.type.slice(5)
      : undefined;

/**
 * The panel's whole purpose is form filling, so a formFiller call from the
 * employee is approved on the spot instead of waiting on the shared approval
 * card — the admin-side v2 popups behave the same way (N18 parity). Any other
 * tool keeps the regular approval flow.
 */
function FormFillerAutoApprover() {
  const { decideToolCall } = useAIChatBase();
  const { messages } = useAIChatMessages();
  const { status } = useAIChatStatus();
  const approvedRef = useRef(new Set<string>());

  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isAIToolPart(part) || getToolPartName(part) !== "formFiller") {
          continue;
        }
        if (part.state !== "input-available") continue;
        // getNocoBaseToolMetadata types only autoApprove; the runtime object
        // also carries invokeStatus and requiresApproval (tool-call-card reads
        // the same fields).
        const metadata = getNocoBaseToolMetadata(part) as
          | { autoApprove?: unknown; invokeStatus?: string; requiresApproval?: boolean }
          | undefined;
        if (
          metadata?.invokeStatus !== "interrupted" &&
          metadata?.requiresApproval !== true
        ) {
          continue;
        }
        if (approvedRef.current.has(part.toolCallId)) continue;
        approvedRef.current.add(part.toolCallId);
        void decideToolCall({
          messageId: message.id,
          toolCallId: part.toolCallId,
          toolName: "formFiller",
          decision: "approve",
        }).catch(() => {
          approvedRef.current.delete(part.toolCallId);
        });
      }
    }
  }, [decideToolCall, messages, status]);

  return null;
}

/**
 * A second click inside this window is dropped. The first click may still be
 * queued behind the chat provider's task-handler binding, where the
 * controller's `open` snapshot has not flipped yet — this ref closes that gap
 * so a double click can never start two fill conversations.
 */
const TRIGGER_DEBOUNCE_MS = 500;

const FORM_FILL_INSTRUCTIONS =
  'Use the formFiller tool with this form to fill the fields the user described. ' +
  'The tool only changes visible field values and does not submit the form.';

export type UseAiEmployeeFillOptions = {
  /** Stable form id shared by the form registry and the page-context reference. */
  formId: string;
  title: string;
  fields: AIFormField[];
  getValues: () => Record<string, unknown>;
  setValues: (values: Record<string, unknown>) => void;
  /** Extra domain guidance appended to the formFiller context instructions. */
  instructions?: string;
  /** Composer placeholder; defaults to a shared "describe the record" hint. */
  placeholder?: string;
};

export type AiEmployeeFill = {
  /** Avatar button for the drawer footer, next to Cancel/Submit. */
  trigger: ReactNode;
  /** Inline chat panel for the form content area; mounts above the fields. */
  panel: ReactNode;
};

/**
 * Replaces the former one-shot AiFillPanel with the vendored AI-employee chat:
 * the form is registered in the AI form registry (formFiller target) and as a
 * page element (fresh values on every send), the avatar button opens a
 * ChatInline conversation bound to `dex` with the form as work context, and
 * streaming output keeps the user informed while MiniMax-M3 reasons — the
 * former 45s one-shot timeout no longer applies to this path.
 */
export function useAiEmployeeFill(
  options: UseAiEmployeeFillOptions
): AiEmployeeFill {
  const translate = useTranslate();
  const ai = useAI();
  const formRegistry = useAIFormRegistry();
  const controller = useAIChatController();
  const { open } = useAIChatControllerState(controller);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const openingRef = useRef(false);

  useEffect(
    () =>
      formRegistry.register({
        id: options.formId,
        title: options.title,
        fields: options.fields,
        getValues: () => optionsRef.current.getValues(),
        setValues: (values) => optionsRef.current.setValues(values),
      }),
    [formRegistry, options.fields, options.formId, options.title]
  );

  // Page-context registration keeps getContext fresh: the resolver re-reads it
  // before every send, so the model always sees the form's current values.
  const contextRef = useAIPageElement({
    id: options.formId,
    title: options.title,
    kind: "form",
    getContext: async () => ({
      form: optionsRef.current.formId,
      title: optionsRef.current.title,
      fields: optionsRef.current.fields,
      value: optionsRef.current.getValues(),
      instructions: options.instructions
        ? `${FORM_FILL_INSTRUCTIONS} ${options.instructions}`
        : FORM_FILL_INSTRUCTIONS,
    }),
  });

  const employee = ai.employees.find(
    (item) => item.username === FORM_FILL_EMPLOYEE
  );

  const triggerFill = () => {
    if (openingRef.current || controller.getSnapshot().open) return;
    openingRef.current = true;
    controller.triggerTask({
      aiEmployee: FORM_FILL_EMPLOYEE,
      context: [
        createAIPageContextReference({
          id: options.formId,
          title: options.title,
          kind: "form",
        }),
      ],
      open: true,
    });
    window.setTimeout(() => {
      openingRef.current = false;
    }, TRIGGER_DEBOUNCE_MS);
  };

  if (ai.configurationStatus !== "ready" || !employee) {
    return { trigger: null, panel: null };
  }

  const trigger = (
    <button
      type="button"
      onClick={triggerFill}
      aria-label={translate(
        "ai.employeeFill.open",
        { ns: "starter" },
        "Fill with AI employee"
      )}
      title={`${employee.nickname ?? FORM_FILL_EMPLOYEE} · ${translate(
        "ai.employeeFill.open",
        { ns: "starter" },
        "Fill with AI employee"
      )}`}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border bg-background pr-3 shadow-sm transition-transform outline-none hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <AIEmployeeAvatar employee={employee} />
      <span className="text-sm font-medium">
        {translate(
          "ai.employeeFill.open",
          { ns: "starter" },
          "Fill with AI employee"
        )}
      </span>
    </button>
  );

  const panel = (
    <div ref={contextRef} data-ai-employee-fill={options.formId}>
      <AIChatProvider
        id={`ai-employee-fill-${options.formId}`}
        controller={controller}
        defaultEmployee={FORM_FILL_EMPLOYEE}
      >
        {open ? (
          <ChatInline className="flex h-[28rem] min-h-0 flex-col">
          <FormFillerAutoApprover />
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <span className="truncate text-xs font-medium text-muted-foreground">
                {employee.nickname ?? FORM_FILL_EMPLOYEE}
                {employee.position ? ` · ${employee.position}` : ""}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate(
                  "ai.employeeFill.close",
                  { ns: "starter" },
                  "Close AI panel"
                )}
                onClick={() => controller.close()}
              >
                <X />
              </Button>
            </div>
            <AIChatWindow
              className="min-h-0 flex-1"
              showConversationToggle={false}
              placeholder={
                options.placeholder ??
                translate(
                  "ai.employeeFill.placeholder",
                  { ns: "starter" },
                  "Describe this record in your own words; the AI employee fills the form for you."
                )
              }
            />
          </ChatInline>
        ) : null}
      </AIChatProvider>
    </div>
  );

  return { trigger, panel };
}
