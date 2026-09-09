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
import type { CustomerFormValues, CustomerRecord } from "../types";
import { CustomerFormFields } from "./fields";

const toServerValues = (values: CustomerFormValues) => {
  const { ownerId, ...rest } = values;
  return { ...rest, owner: ownerId } as unknown as CustomerFormValues;
};

export const CustomerCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.customers.drawer.create.title", { ns: "starter" }, "Add customer")}
        description={translate(
          "crm.customers.drawer.create.description",
          { ns: "starter" },
          "Add a client company you sell to."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <CustomerCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function CustomerCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<CustomerRecord, HttpError, CustomerFormValues>({
    refineCoreProps: {
      resource: "crm_customers",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      company_name: "",
      industry: null,
      status: "active",
      website: "",
      phone: "",
      notes: "",
      ownerId: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <CustomerFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.customers.form.creating", { ns: "starter" }, "Adding...")
              : translate("crm.customers.form.create", { ns: "starter" }, "Add customer")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const CustomerEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.customers.drawer.edit.title", { ns: "starter" }, "Edit customer")}
        description={translate(
          "crm.customers.drawer.edit.description",
          { ns: "starter" },
          "Update this account's profile."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <CustomerEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function CustomerEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<CustomerRecord, HttpError, CustomerFormValues>({
    refineCoreProps: {
      resource: "crm_customers",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["owner"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  const record = query?.data?.data;
  const { getFieldState, setValue } = form;

  // Re-sync the owner id when the API returns only the nested `owner.id`;
  // guard against overwriting the user's own edit.
  useEffect(() => {
    if (!record || getFieldState("ownerId").isDirty) return;

    setValue(
      "ownerId",
      toPickerValue(record.ownerId ?? record.owner?.id),
      { shouldDirty: false, shouldTouch: false, shouldValidate: false }
    );
  }, [record, getFieldState, setValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <CustomerFormFields
            form={form}
            translate={translate}
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
