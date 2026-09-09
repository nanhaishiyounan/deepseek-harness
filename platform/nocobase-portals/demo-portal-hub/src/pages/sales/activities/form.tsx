import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { useContextualCloseTo } from "../route-surfaces";
import type { ActivityFormValues, ActivityRecord } from "../types";
import { ActivityFormFields } from "./fields";

type ActivitySurfaceProps = {
  presetDealId?: string;
};

const toServerValues = (values: ActivityFormValues) => {
  const { deal_id, ...rest } = values;
  return {
    ...rest,
    deal: deal_id ? Number(deal_id) : null,
  } as unknown as ActivityFormValues;
};

export const ActivityCreate = ({ presetDealId }: ActivitySurfaceProps = {}) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "sales.activities.drawer.create.title",
          { ns: "starter" },
          "Log activity"
        )}
        description={translate(
          "sales.activities.drawer.create.description",
          { ns: "starter" },
          "Record a call, email or meeting against a deal."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ActivityCreateForm presetDealId={presetDealId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ActivityCreateForm({ presetDealId }: ActivitySurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ActivityRecord, HttpError, ActivityFormValues>({
    refineCoreProps: {
      resource: "hub_sales_activities",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      type: "call",
      subject: "",
      notes: "",
      date: null,
      deal_id: presetDealId ? String(presetDealId) : null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ActivityFormFields form={form} presetDealId={presetDealId} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate(
                  "sales.activities.form.creating",
                  { ns: "starter" },
                  "Logging..."
                )
              : translate(
                  "sales.activities.form.create",
                  { ns: "starter" },
                  "Log activity"
                )}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ActivityEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "sales.activities.drawer.edit.title",
          { ns: "starter" },
          "Edit activity"
        )}
        description={translate(
          "sales.activities.drawer.edit.description",
          { ns: "starter" },
          "Update this logged activity."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ActivityEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ActivityEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ActivityRecord, HttpError, ActivityFormValues>({
    refineCoreProps: {
      resource: "hub_sales_activities",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["deal"] },
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
          <ActivityFormFields form={form} record={query?.data?.data} />
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
