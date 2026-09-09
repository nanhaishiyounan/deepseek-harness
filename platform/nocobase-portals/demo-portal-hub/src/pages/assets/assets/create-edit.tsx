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
import { useContextualCloseTo } from "../route-surfaces";
import { toDateInputValue } from "../constants";
import type { AssetFormValues, AssetRecord } from "../types";
import { AssetFormFields } from "./fields";

export const AssetCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.assets.drawer.create.title", { ns: "starter" }, "Add asset")}
        description={translate(
          "assets.assets.drawer.create.description",
          { ns: "starter" },
          "Register a new device in the asset register."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <AssetCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function AssetCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<AssetRecord, HttpError, AssetFormValues>({
    refineCoreProps: {
      resource: "hub_as_assets",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      tag: "",
      name: "",
      category: null,
      status: "in_stock",
      purchase_date: null,
      value: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AssetFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("assets.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("assets.assets.form.creating", { ns: "starter" }, "Adding...")
              : translate("assets.assets.form.create", { ns: "starter" }, "Add asset")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const AssetEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.assets.drawer.edit.title", { ns: "starter" }, "Edit asset")}
        description={translate(
          "assets.assets.drawer.edit.description",
          { ns: "starter" },
          "Update this device's details."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <AssetEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function AssetEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<AssetRecord, HttpError, AssetFormValues>({
    refineCoreProps: {
      resource: "hub_as_assets",
      action: "edit",
      id,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  // Normalize the loaded ISO date into the yyyy-MM-dd the native input expects.
  const purchaseValue = form.watch("purchase_date");
  useEffect(() => {
    if (purchaseValue && purchaseValue.length > 10) {
      form.setValue("purchase_date", toDateInputValue(purchaseValue));
    }
  }, [form, purchaseValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AssetFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("assets.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("assets.common.saving", { ns: "starter" }, "Saving...")
              : translate("assets.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
