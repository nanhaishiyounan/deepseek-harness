import { useTranslate } from "@refinedev/core";
import { useMemo, type PropsWithChildren } from "react";
import {
  AIEmployeeShortcut,
  useAIPageElementHandle,
} from "@/extensions/nocobase-ai/components";
import {
  AIPageContextScope,
  useAI,
  type AIEmployeeTask,
} from "@/extensions/nocobase-ai/providers";

/**
 * The CRM-specific AI employee. Created on the NocoBase instance as
 * `crm-assistant`; when it is missing or the LLM service is unconfigured the
 * shortcut renders nothing rather than showing a dead control.
 */
export const CRM_AI_EMPLOYEE = "crm-assistant";

type CrmAIContextProps = {
  /** Stable identifier so the composer's page-element picker can list it. */
  id: string;
  title: string;
  kind?: string;
  /** Resolved again immediately before each send, so it stays current. */
  getContext: () => unknown;
};

/**
 * Registers the surrounding surface as AI page context and scopes it so any
 * shortcut or chat rendered inside inherits it.
 */
export function CrmAIContext({
  id,
  title,
  kind = "record-detail",
  getContext,
  children,
}: PropsWithChildren<CrmAIContextProps>) {
  const handle = useAIPageElementHandle({ id, title, kind, getContext });
  return (
    <AIPageContextScope context={handle.context}>
      <div ref={handle.ref} className="contents">
        {children}
      </div>
    </AIPageContextScope>
  );
}

export function CrmAIShortcut({
  tasks,
  label,
  size = 32,
  className,
}: {
  tasks: AIEmployeeTask[];
  label?: string;
  size?: number;
  className?: string;
}) {
  const ai = useAI();
  if (ai.configurationStatus !== "ready") return null;
  return (
    <AIEmployeeShortcut
      aiEmployee={CRM_AI_EMPLOYEE}
      tasks={tasks}
      label={label}
      size={size}
      className={className}
    />
  );
}

type Translate = ReturnType<typeof useTranslate>;

const task = (
  title: string,
  user: string,
  system?: string
): AIEmployeeTask => ({
  title,
  message: { user, system },
  autoSend: true,
});

export function useLeadListTasks(translate: Translate) {
  return useMemo<AIEmployeeTask[]>(
    () => [
      task(
        translate("crm.ai.leads.triage", { ns: "starter" }, "Triage these leads"),
        translate(
          "crm.ai.leads.triage.prompt",
          { ns: "starter" },
          "Rank the leads currently shown by who I should contact first, and give a one-line reason for each."
        )
      ),
      task(
        translate("crm.ai.leads.gaps", { ns: "starter" }, "Find qualification gaps"),
        translate(
          "crm.ai.leads.gaps.prompt",
          { ns: "starter" },
          "Which of the leads shown are missing the information I need to qualify them, and what should I ask for?"
        )
      ),
    ],
    [translate]
  );
}

export function useLeadDetailTasks(translate: Translate) {
  return useMemo<AIEmployeeTask[]>(
    () => [
      task(
        translate("crm.ai.lead.qualify", { ns: "starter" }, "Qualify this lead"),
        translate(
          "crm.ai.lead.qualify.prompt",
          { ns: "starter" },
          "Qualify this lead. Recommend a status and the single next step."
        )
      ),
      {
        title: translate("crm.ai.lead.email", { ns: "starter" }, "Draft a first-touch email"),
        message: {
          user: translate(
            "crm.ai.lead.email.prompt",
            { ns: "starter" },
            "Draft a short first-touch email to this lead."
          ),
        },
        autoSend: false,
      },
    ],
    [translate]
  );
}

export function usePipelineTasks(translate: Translate) {
  return useMemo<AIEmployeeTask[]>(
    () => [
      task(
        translate("crm.ai.pipeline.health", { ns: "starter" }, "Review pipeline health"),
        translate(
          "crm.ai.pipeline.health.prompt",
          { ns: "starter" },
          "Review the pipeline shown: where is value concentrated, and which stage is the bottleneck?"
        )
      ),
      task(
        translate("crm.ai.pipeline.risk", { ns: "starter" }, "Which deals are at risk?"),
        translate(
          "crm.ai.pipeline.risk.prompt",
          { ns: "starter" },
          "List the deals at risk of slipping, with the reason and what would unblock each one."
        )
      ),
    ],
    [translate]
  );
}

export function useDealDetailTasks(translate: Translate) {
  return useMemo<AIEmployeeTask[]>(
    () => [
      task(
        translate("crm.ai.deal.assess", { ns: "starter" }, "Assess this deal"),
        translate(
          "crm.ai.deal.assess.prompt",
          { ns: "starter" },
          "Assess this deal's health from its stage, value, timing and recent activity, then give me the next action."
        )
      ),
      {
        title: translate("crm.ai.deal.followUp", { ns: "starter" }, "Draft a follow-up"),
        message: {
          user: translate(
            "crm.ai.deal.followUp.prompt",
            { ns: "starter" },
            "Draft a follow-up email to the contact on this deal."
          ),
        },
        autoSend: false,
      },
    ],
    [translate]
  );
}

export function useCustomerDetailTasks(translate: Translate) {
  return useMemo<AIEmployeeTask[]>(
    () => [
      task(
        translate("crm.ai.customer.summary", { ns: "starter" }, "Summarise this account"),
        translate(
          "crm.ai.customer.summary.prompt",
          { ns: "starter" },
          "Summarise this account: open pipeline, recent activity, and anything outstanding."
        )
      ),
      task(
        translate("crm.ai.customer.next", { ns: "starter" }, "Suggest next actions"),
        translate(
          "crm.ai.customer.next.prompt",
          { ns: "starter" },
          "What are the three highest-value next actions on this account?"
        )
      ),
    ],
    [translate]
  );
}

export function useQuoteDetailTasks(translate: Translate) {
  return useMemo<AIEmployeeTask[]>(
    () => [
      task(
        translate("crm.ai.quote.review", { ns: "starter" }, "Review this quote"),
        translate(
          "crm.ai.quote.review.prompt",
          { ns: "starter" },
          "Review this quote's line items and pricing, and flag anything that looks off before I send it."
        )
      ),
      {
        title: translate("crm.ai.quote.email", { ns: "starter" }, "Draft the covering email"),
        message: {
          user: translate(
            "crm.ai.quote.email.prompt",
            { ns: "starter" },
            "Draft a covering email to send with this quote."
          ),
        },
        autoSend: false,
      },
    ],
    [translate]
  );
}
