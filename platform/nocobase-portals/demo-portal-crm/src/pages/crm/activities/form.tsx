import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { toPickerValue } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { ActivityFormValues, ActivityRecord } from "../types";
import { ActivityFormFields } from "./fields";

type ActivitySurfaceProps = {
  presetCustomerId?: string;
  presetDealId?: string;
};

const toServerValues = (values: ActivityFormValues, presetDealId?: string) => {
  const { customer_id, contact_id, ...rest } = values;
  return {
    ...rest,
    customer: customer_id,
    contact: contact_id,
    ...(presetDealId ? { deal: presetDealId } : {}),
  } as unknown as ActivityFormValues;
};

export const ActivityCreate = ({ presetCustomerId, presetDealId }: ActivitySurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.activities.drawer.create.title", { ns: "starter" }, "Log activity")}
        description={translate(
          "crm.activities.drawer.create.description",
          { ns: "starter" },
          "Record a call, meeting or email."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ActivityCreateForm presetCustomerId={presetCustomerId} presetDealId={presetDealId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ActivityCreateForm({ presetCustomerId, presetDealId }: ActivitySurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const now = new Date();
  const nowLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ActivityRecord, HttpError, ActivityFormValues>({
    refineCoreProps: {
      resource: "crm_activities",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      subject: "",
      type: "call",
      date: nowLocal,
      customer_id: presetCustomerId ? String(presetCustomerId) : null,
      contact_id: null,
      notes: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values, presetDealId)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ActivityFormFields
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
              ? translate("crm.activities.form.creating", { ns: "starter" }, "Logging...")
              : translate("crm.activities.form.create", { ns: "starter" }, "Log activity")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ActivityEdit = ({
  presetCustomerId,
  idParam = "id",
}: ActivitySurfaceProps & { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.activities.drawer.edit.title", { ns: "starter" }, "Edit activity")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ActivityEditForm recordId={recordId} presetCustomerId={presetCustomerId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ActivityEditForm({
  recordId,
  presetCustomerId,
}: ActivitySurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ActivityRecord, HttpError, ActivityFormValues>({
    refineCoreProps: {
      resource: "crm_activities",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["customer", "contact"] },
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
  }, [record, getFieldState, setValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ActivityFormFields
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
