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
import type { ProductFormValues, ProductRecord } from "../types";
import { ProductFormFields } from "./fields";

export const ProductCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("inventory.products.drawer.create.title", { ns: "starter" }, "New product")}
        description={translate(
          "inventory.products.drawer.create.description",
          { ns: "starter" },
          "Add a product to the catalog."
        )}
        closeTo={closeTo}
        closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ProductForm mode="create" />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

export const ProductEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("inventory.products.drawer.edit.title", { ns: "starter" }, "Edit product")}
        description={translate(
          "inventory.products.drawer.edit.description",
          { ns: "starter" },
          "Update catalog details and reorder level."
        )}
        closeTo={closeTo}
        closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ProductForm mode="edit" id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ProductForm({ mode, id }: { mode: "create" | "edit"; id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ProductRecord, HttpError, ProductFormValues>({
    refineCoreProps: {
      resource: "hub_inv_products",
      action: mode,
      id,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      sku: "",
      name: "",
      category: "other",
      unit_price: null,
      reorder_level: null,
      status: "active",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10">
          <ProductFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("inventory.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("inventory.common.saving", { ns: "starter" }, "Saving…")
              : mode === "create"
                ? translate("inventory.products.form.create", { ns: "starter" }, "Add product")
                : translate("inventory.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
