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
import type { WarehouseFormValues, WarehouseRecord } from "../types";
import { WarehouseFormFields } from "./fields";

export const WarehouseCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("inventory.warehouses.drawer.create.title", { ns: "starter" }, "New warehouse")}
        description={translate(
          "inventory.warehouses.drawer.create.description",
          { ns: "starter" },
          "Add a stocking location."
        )}
        closeTo={closeTo}
        closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <WarehouseForm mode="create" />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

export const WarehouseEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("inventory.warehouses.drawer.edit.title", { ns: "starter" }, "Edit warehouse")}
        description={translate(
          "inventory.warehouses.drawer.edit.description",
          { ns: "starter" },
          "Update this stocking location."
        )}
        closeTo={closeTo}
        closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <WarehouseForm mode="edit" id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function WarehouseForm({ mode, id }: { mode: "create" | "edit"; id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<WarehouseRecord, HttpError, WarehouseFormValues>({
    refineCoreProps: {
      resource: "hub_inv_warehouses",
      action: mode,
      id,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: { name: "", code: "", location: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10">
          <WarehouseFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("inventory.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("inventory.common.saving", { ns: "starter" }, "Saving…")
              : mode === "create"
                ? translate("inventory.warehouses.form.create", { ns: "starter" }, "Add warehouse")
                : translate("inventory.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
