import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useAiEmployeeFill } from "@/components/ai-employee-fill";
import type { AIFormField } from "@/extensions/nocobase-ai/providers";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { helpdeskRoutes, getTicketShowPath } from "../routes";
import type { TicketFormValues, TicketRecord } from "../types";
import { TicketFormFields } from "./fields";

const RESOURCE = "hub_hd_tickets";

export const TicketCreate = () => {
  const translate = useTranslate();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("helpdesk.form.create.title", { ns: "starter" }, "New ticket")}
        description={translate(
          "helpdesk.form.create.description",
          { ns: "starter" },
          "Log a new support request and route it to an agent."
        )}
        closeTo={helpdeskRoutes.tickets}
        closeLabel={translate("buttons.close", "Close")}
        beforeClose={beforeClose}
      >
        <TicketCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function TicketCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<TicketRecord, HttpError, TicketFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      subject: "",
      description: "",
      category: null,
      priority: "med",
      status: "open",
      requesterId: null,
      assigneeId: null,
    },
  });

  const aiFields = useMemo<AIFormField[]>(
    () => [
      { name: "subject", title: translate("helpdesk.fields.subject", { ns: "starter" }, "Subject"), type: "string", required: true },
      { name: "description", title: translate("helpdesk.fields.description", { ns: "starter" }, "Description"), type: "string" },
      { name: "category", title: translate("helpdesk.fields.category", { ns: "starter" }, "Category"), type: "string", enum: ["billing", "technical", "account", "other"] },
      { name: "priority", title: translate("helpdesk.fields.priority", { ns: "starter" }, "Priority"), type: "string", enum: ["low", "med", "high", "urgent"] },
      { name: "status", title: translate("helpdesk.fields.status", { ns: "starter" }, "Status"), type: "string", enum: ["open", "pending", "resolved", "closed"] },
    ],
    [translate]
  );
  const aiEmployee = useAiEmployeeFill({
    formId: "crm-helpdesk-ticket-create",
    title: translate("helpdesk.form.create.title", { ns: "starter" }, "New ticket"),
    fields: aiFields,
    getValues: () => form.getValues() as Record<string, unknown>,
    setValues: (values) => {
      for (const [name, value] of Object.entries(values)) {
        form.setValue(name as keyof TicketFormValues, value as never, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    instructions:
      "A new ticket starts as open unless the text says otherwise. " +
      "Priority values are low, med, high or urgent; category values are billing, technical, account or other.",
    placeholder: translate(
      "helpdesk.form.aiFill.placeholder",
      { ns: "starter" },
      "Example: 客户反馈到货破损，紧急工单，物流仓储类，优先处理冷链盒破损赔付。"
    ),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {aiEmployee.panel}
          <TicketFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          {aiEmployee.trigger}
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("buttons.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("helpdesk.form.create.submitting", { ns: "starter" }, "Creating...")
              : translate("helpdesk.form.create.submit", { ns: "starter" }, "Create ticket")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const TicketEdit = ({
  returnTo = "list",
}: {
  returnTo?: "list" | "show";
}) => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  const closeTo =
    returnTo === "show" && id ? getTicketShowPath(id) : helpdeskRoutes.tickets;
  return (
    <>
      <RouteDrawer
        title={translate("helpdesk.form.edit.title", { ns: "starter" }, "Edit ticket")}
        description={translate(
          "helpdesk.form.edit.description",
          { ns: "starter" },
          "Update the details, priority, status or assignment."
        )}
        closeTo={closeTo}
        closeLabel={translate("buttons.close", "Close")}
        beforeClose={beforeClose}
      >
        <TicketEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function TicketEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<TicketRecord, HttpError, TicketFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "edit",
      id,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <TicketFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("buttons.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("helpdesk.form.edit.submitting", { ns: "starter" }, "Saving...")
              : translate("helpdesk.form.edit.submit", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
