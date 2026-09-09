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
import type { DealFormValues, DealRecord } from "../types";
import { DealFormFields } from "./fields";

type DealSurfaceProps = {
  presetAccountId?: string;
};

const toServerValues = (values: DealFormValues) => {
  const { account_id, owner_id, ...rest } = values;
  return {
    ...rest,
    account: account_id ? Number(account_id) : null,
    owner: owner_id ? Number(owner_id) : null,
  } as unknown as DealFormValues;
};

export const DealCreate = ({ presetAccountId }: DealSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("sales.deals.drawer.create.title", { ns: "starter" }, "New deal")}
        description={translate(
          "sales.deals.drawer.create.description",
          { ns: "starter" },
          "Add a deal to the pipeline."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <DealCreateForm presetAccountId={presetAccountId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function DealCreateForm({ presetAccountId }: DealSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<DealRecord, HttpError, DealFormValues>({
    refineCoreProps: {
      resource: "hub_sales_deals",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      title: "",
      stage: "inquiry",
      amount: null,
      expected_close_date: null,
      account_id: presetAccountId ? String(presetAccountId) : null,
      owner_id: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <DealFormFields form={form} presetAccountId={presetAccountId} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("sales.deals.form.creating", { ns: "starter" }, "Adding...")
              : translate("sales.deals.form.create", { ns: "starter" }, "Add deal")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const DealEdit = ({
  presetAccountId,
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
        title={translate("sales.deals.drawer.edit.title", { ns: "starter" }, "Edit deal")}
        description={translate(
          "sales.deals.drawer.edit.description",
          { ns: "starter" },
          "Update stage, value and timing."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <DealEditForm recordId={recordId} presetAccountId={presetAccountId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function DealEditForm({
  recordId,
  presetAccountId,
}: DealSurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<DealRecord, HttpError, DealFormValues>({
    refineCoreProps: {
      resource: "hub_sales_deals",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["account", "owner"] },
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
          <DealFormFields
            form={form}
            presetAccountId={presetAccountId}
            record={query?.data?.data}
          />
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
