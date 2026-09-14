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

  const aiFields = useMemo<AIFormField[]>(
    () => [
      { name: "sku", title: translate("inventory.products.fields.sku", { ns: "starter" }, "SKU"), type: "string", required: true },
      { name: "name", title: translate("inventory.products.fields.name", { ns: "starter" }, "Name"), type: "string", required: true },
      { name: "category", title: translate("inventory.products.fields.category", { ns: "starter" }, "Category"), type: "string" },
      { name: "unit_price", title: translate("inventory.products.fields.unitPrice", { ns: "starter" }, "Unit price (USD)"), type: "number" },
      { name: "reorder_level", title: translate("inventory.products.fields.reorderAt", { ns: "starter" }, "Reorder at"), type: "number" },
      { name: "status", title: translate("inventory.products.fields.status", { ns: "starter" }, "Status"), type: "string", enum: ["active", "discontinued"] },
    ],
    [translate]
  );
  const aiEmployee = useAiEmployeeFill({
    formId: "crm-inv-product-create",
    title: translate("inventory.products.drawer.create.title", { ns: "starter" }, "Add product"),
    fields: aiFields,
    getValues: () => form.getValues() as Record<string, unknown>,
    setValues: (values) => {
      for (const [name, value] of Object.entries(values)) {
        form.setValue(name as keyof ProductFormValues, value as never, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    instructions:
      "A new product starts as active. Status values are active or discontinued; " +
      "unit_price and reorder_level are numbers.",
    placeholder: translate(
      "inventory.products.aiFill.placeholder",
      { ns: "starter" },
      "Example: 新品冻干蓝莓粒 3kg，SKU-LD-0012，冷冻类，单价 42 美元，补货点 60。"
    ),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10">
          {mode === "create" ? aiEmployee.panel : null}
          <ProductFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          {mode === "create" ? aiEmployee.trigger : null}
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
