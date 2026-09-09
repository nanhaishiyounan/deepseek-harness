import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useMemo } from "react";
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
import { DEAL_STAGES } from "../constants";
import { toPickerValue } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { DealFormValues, DealRecord } from "../types";
import { DealFormFields } from "./fields";

type DealSurfaceProps = {
  presetCustomerId?: string;
};

const toServerValues = (values: DealFormValues) => {
  const { customer_id, contact_id, ownerId, ...rest } = values;
  return {
    ...rest,
    customer: customer_id,
    contact: contact_id,
    owner: ownerId,
  } as unknown as DealFormValues;
};

export const DealCreate = ({ presetCustomerId }: DealSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.deals.drawer.create.title", { ns: "starter" }, "New deal")}
        description={translate(
          "crm.deals.drawer.create.description",
          { ns: "starter" },
          "Add a deal to the pipeline."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <DealCreateForm presetCustomerId={presetCustomerId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function DealCreateForm({ presetCustomerId }: DealSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<DealRecord, HttpError, DealFormValues>({
    refineCoreProps: {
      resource: "crm_deals",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      title: "",
      stage: "inquiry",
      amount: null,
      expected_close_date: null,
      closed_date: null,
      customer_id: presetCustomerId ? String(presetCustomerId) : null,
      contact_id: null,
      ownerId: null,
      notes: "",
    },
  });

  // Stage options come from the same constant the stage Select renders from.
  const aiFields = useMemo<AiFillField[]>(
    () => [
      {
        name: "title",
        title: translate("crm.deals.fields.title", { ns: "starter" }, "Title"),
        type: "string",
        description: "A short deal name, usually the customer plus what they are buying.",
      },
      {
        name: "stage",
        title: translate("crm.deals.fields.stage", { ns: "starter" }, "Stage"),
        type: "string",
        enum: [...DEAL_STAGES],
      },
      {
        name: "amount",
        title: translate("crm.deals.fields.amount", { ns: "starter" }, "Amount"),
        type: "number",
        description:
          "Deal value in USD as a plain number, with no currency symbol or thousands separator.",
      },
      {
        name: "expected_close_date",
        title: translate("crm.deals.fields.expectedCloseDate", { ns: "starter" }, "Expected close date"),
        type: "date",
        description:
          "Expected close date as YYYY-MM-DD. Only when the text states or clearly implies a date.",
      },
      {
        name: "notes",
        title: translate("crm.deals.fields.notes", { ns: "starter" }, "Notes"),
        type: "string",
        description: "Anything useful that does not belong in the other fields.",
      },
    ],
    [translate]
  );

  const ai = useAiFill({
    formId: "crm-deal-create",
    title: translate("crm.deals.drawer.create.title", { ns: "starter" }, "New deal"),
    fields: aiFields,
    getValues: () => form.getValues() as Record<string, unknown>,
    setValues: (values) => {
      for (const [name, value] of Object.entries(values)) {
        form.setValue(name as keyof DealFormValues, value as never, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    instructions:
      "A deal that is still being scoped is inquiry; once pricing has been sent it is quote. " +
      "Only use won or lost when the text says the deal is already decided.",
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
              "crm.deals.form.aiFillDescription",
              { ns: "starter" },
              "Paste the call note or email thread. AI assist will structure the deal for you."
            )}
            inputLabel={translate(
              "crm.deals.form.aiFillLabel",
              { ns: "starter" },
              "Describe the deal"
            )}
            placeholder={translate(
              "crm.deals.form.aiFillPlaceholder",
              { ns: "starter" },
              "Example: Brightline Logistics wants 40 telematics units, around 96000 USD. We sent pricing last week and they want to close before the end of next month."
            )}
          />
          <DealFormFields
            form={form}
            translate={translate}
            presetCustomerId={presetCustomerId}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.deals.form.creating", { ns: "starter" }, "Adding...")
              : translate("crm.deals.form.create", { ns: "starter" }, "Add deal")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const DealEdit = ({
  presetCustomerId,
  idParam = "id",
}: DealSurfaceProps & { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.deals.drawer.edit.title", { ns: "starter" }, "Edit deal")}
        description={translate(
          "crm.deals.drawer.edit.description",
          { ns: "starter" },
          "Update stage, value and timing."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <DealEditForm
          recordId={recordId}
          presetCustomerId={presetCustomerId}
        />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function DealEditForm({
  recordId,
  presetCustomerId,
}: DealSurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<DealRecord, HttpError, DealFormValues>({
    refineCoreProps: {
      resource: "crm_deals",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["customer", "contact", "owner"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  const record = query?.data?.data;
  const { getFieldState, setValue } = form;

  // Re-sync relation ids when the API returns only nested objects; skip any
  // field the user has already touched.
  useEffect(() => {
    if (!record) return;

    if (!getFieldState("customer_id").isDirty) {
      setValue(
        "customer_id",
        toPickerValue(record.customer_id ?? record.customer?.id),
        { shouldDirty: false, shouldTouch: false, shouldValidate: false }
      );
    }

    if (!getFieldState("contact_id").isDirty) {
      setValue(
        "contact_id",
        toPickerValue(record.contact_id ?? record.contact?.id),
        { shouldDirty: false, shouldTouch: false, shouldValidate: false }
      );
    }

    if (!getFieldState("ownerId").isDirty) {
      setValue(
        "ownerId",
        toPickerValue(record.ownerId ?? record.owner?.id),
        { shouldDirty: false, shouldTouch: false, shouldValidate: false }
      );
    }
  }, [record, getFieldState, setValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <DealFormFields
            form={form}
            translate={translate}
            presetCustomerId={presetCustomerId}
            record={record}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.common.saving", { ns: "starter" }, "Saving...")
              : translate("crm.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
