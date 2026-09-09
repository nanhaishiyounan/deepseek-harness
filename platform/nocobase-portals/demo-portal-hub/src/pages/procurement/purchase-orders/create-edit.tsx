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
import type { PurchaseOrderFormValues, PurchaseOrderRecord } from "../types";
import { PurchaseOrderFormFields } from "./fields";

/** Map foreign-key form fields onto the association names NocoBase writes through. */
const toServerValues = (values: PurchaseOrderFormValues) => {
  const { supplier_id, owner_id, ...rest } = values;
  return {
    ...rest,
    supplier: supplier_id,
    owner: owner_id,
  } as unknown as PurchaseOrderFormValues;
};

export const PurchaseOrderCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "procurement.po.drawer.create.title",
          { ns: "starter" },
          "New purchase order"
        )}
        description={translate(
          "procurement.po.drawer.create.description",
          { ns: "starter" },
          "Raise a purchase order against a supplier."
        )}
        closeTo={closeTo}
        closeLabel={translate("procurement.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <PurchaseOrderCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function PurchaseOrderCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<PurchaseOrderRecord, HttpError, PurchaseOrderFormValues>({
    refineCoreProps: {
      resource: "hub_po_purchase_orders",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      po_number: "",
      supplier_id: null,
      owner_id: null,
      status: "draft",
      order_date: new Date().toISOString().slice(0, 10),
      total: 0,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <PurchaseOrderFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("procurement.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("procurement.po.form.creating", { ns: "starter" }, "Creating...")
              : translate("procurement.po.form.create", { ns: "starter" }, "Create order")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const PurchaseOrderEdit = ({
  idParam = "id",
}: { idParam?: string } = {}) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "procurement.po.drawer.edit.title",
          { ns: "starter" },
          "Edit purchase order"
        )}
        description={translate(
          "procurement.po.drawer.edit.description",
          { ns: "starter" },
          "Update this order's details."
        )}
        closeTo={closeTo}
        closeLabel={translate("procurement.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <PurchaseOrderEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function PurchaseOrderEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<PurchaseOrderRecord, HttpError, PurchaseOrderFormValues>({
    refineCoreProps: {
      resource: "hub_po_purchase_orders",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["supplier", "owner"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  const record = query?.data?.data as PurchaseOrderRecord | undefined;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <PurchaseOrderFormFields form={form} translate={translate} record={record} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("procurement.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("procurement.common.saving", { ns: "starter" }, "Saving...")
              : translate("procurement.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
