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
import type { FollowUpFormValues, FollowUpRecord } from "../types";
import { FollowUpFormFields } from "./fields";

type FollowUpSurfaceProps = {
  presetCustomerId?: string;
};

const toServerValues = (values: FollowUpFormValues) => {
  const { customer_id, ownerId, ...rest } = values;
  return {
    ...rest,
    customer: customer_id,
    owner: ownerId,
  } as unknown as FollowUpFormValues;
};

export const FollowUpCreate = ({ presetCustomerId }: FollowUpSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.followUps.drawer.create.title", { ns: "starter" }, "New follow-up")}
        description={translate(
          "crm.followUps.drawer.create.description",
          { ns: "starter" },
          "Set a reminder so nothing slips."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <FollowUpCreateForm presetCustomerId={presetCustomerId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function FollowUpCreateForm({ presetCustomerId }: FollowUpSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<FollowUpRecord, HttpError, FollowUpFormValues>({
    refineCoreProps: {
      resource: "crm_follow_ups",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      subject: "",
      due_date: null,
      status: "pending",
      customer_id: presetCustomerId ? String(presetCustomerId) : null,
      ownerId: null,
      notes: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <FollowUpFormFields
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
              ? translate("crm.followUps.form.creating", { ns: "starter" }, "Adding...")
              : translate("crm.followUps.form.create", { ns: "starter" }, "Add follow-up")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const FollowUpEdit = ({
  presetCustomerId,
  idParam = "id",
}: FollowUpSurfaceProps & { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.followUps.drawer.edit.title", { ns: "starter" }, "Edit follow-up")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <FollowUpEditForm recordId={recordId} presetCustomerId={presetCustomerId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function FollowUpEditForm({
  recordId,
  presetCustomerId,
}: FollowUpSurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<FollowUpRecord, HttpError, FollowUpFormValues>({
    refineCoreProps: {
      resource: "crm_follow_ups",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["customer", "owner"] },
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
          <FollowUpFormFields
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
