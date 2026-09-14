import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { useContextualCloseTo } from "../route-surfaces";
import type { PoItemFormValues, PoItemRecord } from "../types";

function ItemFields({
  form,
  translate,
}: {
  form: UseFormReturn<PoItemFormValues>;
  translate: ReturnType<typeof useTranslate>;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="product_name"
        rules={{
          required: translate(
            "procurement.po.items.form.productRequired",
            { ns: "starter" },
            "Product name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("procurement.po.items.fields.product", { ns: "starter" }, "Product")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "procurement.po.items.form.productPlaceholder",
                    { ns: "starter" },
                    "e.g. Steel brackets"
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="qty"
          rules={{
            required: translate(
              "procurement.po.items.form.qtyRequired",
              { ns: "starter" },
              "Quantity is required"
            ),
            min: {
              value: 0,
              message: translate(
                "procurement.po.items.form.qtyNegative",
                { ns: "starter" },
                "Quantity cannot be negative"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("procurement.po.items.fields.quantity", { ns: "starter" }, "Quantity")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="10"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : Number(event.target.value)
                      )
                    }
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="unit_price"
          rules={{
            required: translate(
              "procurement.po.items.form.unitPriceRequired",
              { ns: "starter" },
              "Unit price is required"
            ),
            min: {
              value: 0,
              message: translate(
                "procurement.po.items.form.unitPriceNegative",
                { ns: "starter" },
                "Unit price cannot be negative"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("procurement.po.items.fields.unitPrice", { ns: "starter" }, "Unit price")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="8.50"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : Number(event.target.value)
                      )
                    }
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

export const PoItemCreate = ({
  idParam = "id",
}: { idParam?: string } = {}) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const purchaseOrderId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "procurement.po.items.drawer.create.title",
          { ns: "starter" },
          "Add line item"
        )}
        description={translate(
          "procurement.po.items.drawer.create.description",
          { ns: "starter" },
          "Add a product line to this purchase order."
        )}
        closeTo={closeTo}
        closeLabel={translate("procurement.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <PoItemCreateForm purchaseOrderId={purchaseOrderId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function PoItemCreateForm({ purchaseOrderId }: { purchaseOrderId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<PoItemRecord, HttpError, PoItemFormValues>({
    refineCoreProps: {
      resource: "hub_po_items",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: { product_name: "", qty: 1, unit_price: null },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish({
            ...values,
            purchase_order: purchaseOrderId,
          } as unknown as PoItemFormValues)
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ItemFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("procurement.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("procurement.po.items.form.adding", { ns: "starter" }, "Adding...")
              : translate("procurement.po.items.form.add", { ns: "starter" }, "Add item")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const PoItemEdit = () => {
  const translate = useTranslate();
  const { itemId } = useParams<{
    id: string;
    itemId: string;
  }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "procurement.po.items.drawer.edit.title",
          { ns: "starter" },
          "Edit line item"
        )}
        description={translate(
          "procurement.po.items.drawer.edit.description",
          { ns: "starter" },
          "Update this product line."
        )}
        closeTo={closeTo}
        closeLabel={translate("procurement.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <PoItemEditForm id={itemId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function PoItemEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<PoItemRecord, HttpError, PoItemFormValues>({
    refineCoreProps: {
      resource: "hub_po_items",
      action: "edit",
      id,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ItemFields form={form} translate={translate} />
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
