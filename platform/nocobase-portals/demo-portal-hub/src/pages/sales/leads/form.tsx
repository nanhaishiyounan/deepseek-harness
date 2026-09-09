import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import { useParams } from "react-router";
import { AiFillPanel, useAiFill, type AiFillField } from "@/components/ai-fill";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { LEAD_SOURCES, MANUAL_LEAD_STATUSES } from "../constants";
import { useContextualCloseTo } from "../route-surfaces";
import type { LeadFormValues, LeadRecord } from "../types";
import { LeadFormFields } from "./fields";

const toServerValues = (values: LeadFormValues) => {
  const { owner_id, ...rest } = values;
  return {
    ...rest,
    owner: owner_id ? Number(owner_id) : null,
  } as unknown as LeadFormValues;
};

export const LeadCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("sales.leads.drawer.create.title", { ns: "starter" }, "New lead")}
        description={translate(
          "sales.leads.drawer.create.description",
          { ns: "starter" },
          "Capture an inbound or prospected lead."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <LeadCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function LeadCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<LeadRecord, HttpError, LeadFormValues>({
    refineCoreProps: {
      resource: "hub_sales_leads",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      name: "",
      company: "",
      email: "",
      source: null,
      status: "new",
      owner_id: null,
    },
  });

  // Allowed values are the same option lists the Select inputs render.
  const aiFields = useMemo<AiFillField[]>(
    () => [
      {
        name: "name",
        title: translate("sales.leads.field.name", { ns: "starter" }, "Name"),
        type: "string",
        description: "Full name of the person who made contact.",
      },
      {
        name: "company",
        title: translate("sales.leads.field.company", { ns: "starter" }, "Company"),
        type: "string",
      },
      {
        name: "email",
        title: translate("sales.leads.field.email", { ns: "starter" }, "Email"),
        type: "string",
        description: "Only when the text contains an email address.",
      },
      {
        name: "source",
        title: translate("sales.leads.field.source", { ns: "starter" }, "Source"),
        type: "string",
        enum: [...LEAD_SOURCES],
      },
      {
        name: "status",
        title: translate("sales.leads.field.status", { ns: "starter" }, "Status"),
        type: "string",
        enum: [...MANUAL_LEAD_STATUSES],
      },
    ],
    [translate]
  );

  const ai = useAiFill({
    formId: "hub-sales-lead-create",
    title: translate("sales.leads.drawer.create.title", { ns: "starter" }, "Add lead"),
    fields: aiFields,
    getValues: () => form.getValues() as Record<string, unknown>,
    setValues: (values) => {
      for (const [name, value] of Object.entries(values)) {
        form.setValue(name as keyof LeadFormValues, value as never, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    instructions:
      "A lead that has only just made contact is new. Use qualified or unqualified " +
      "only when the text says the lead has already been assessed. Never set converted " +
      "by hand — the conversion flow writes it together with the account, contact and " +
      "deal it produced.",
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AiFillPanel
            ai={ai}
            description={translate(
              "sales.leads.aiFill.desc",
              { ns: "starter" },
              "Paste the enquiry, business card or call note. AI assist will structure the lead for you."
            )}
            inputLabel={translate("sales.leads.aiFill.label", { ns: "starter" }, "Describe the lead")}
            placeholder={translate(
              "sales.leads.aiFill.placeholder",
              { ns: "starter" },
              "Example: Tom Reyes from Halden Freight called after seeing our website; he asked for a quote for 12 depot scanners."
            )}
          />
          <LeadFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("sales.leads.form.creating", { ns: "starter" }, "Adding...")
              : translate("sales.leads.form.create", { ns: "starter" }, "Add lead")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const LeadEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("sales.leads.drawer.edit.title", { ns: "starter" }, "Edit lead")}
        description={translate(
          "sales.leads.drawer.edit.description",
          { ns: "starter" },
          "Update this lead's details and status."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <LeadEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function LeadEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<LeadRecord, HttpError, LeadFormValues>({
    refineCoreProps: {
      resource: "hub_sales_leads",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["owner"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <LeadFormFields form={form} record={query?.data?.data} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("sales.common.saving", { ns: "starter" }, "Saving...")
              : translate("sales.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
