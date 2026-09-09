import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { PRODUCT_CATEGORIES, labelFor } from "../constants";
import { useContextualCloseTo } from "../route-surfaces";
import type { ProductRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

type ProductFormValues = {
  sku: string;
  name: string;
  category: string;
  unit_price: number | null;
  active: boolean;
};

const defaultValues: ProductFormValues = {
  sku: "",
  name: "",
  category: "seating",
  unit_price: null,
  active: true,
};

function ProductFormFields({
  form,
  translate,
}: {
  form: UseFormReturn<ProductFormValues>;
  translate: Translate;
}) {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="sku"
          rules={{ required: translate("crm.products.validation.sku", { ns: "starter" }, "SKU is required") }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("crm.products.fields.sku", { ns: "starter" }, "SKU")}</FormLabel>
              <FormControl render={<Input {...field} value={field.value ?? ""} placeholder={translate("crm.products.placeholder.sku", { ns: "starter" }, "e.g. CHR-ERG-01")} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("crm.products.fields.category", { ns: "starter" }, "Category")}</FormLabel>
              <FormControl
                render={
                  <Select value={field.value ?? "seating"} onValueChange={(value) => field.onChange(value ?? "seating")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{labelFor(PRODUCT_CATEGORIES, field.value ?? "seating", translate)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_CATEGORIES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{labelFor(PRODUCT_CATEGORIES, option.value, translate)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="name"
        rules={{ required: translate("crm.products.validation.name", { ns: "starter" }, "Product name is required") }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("crm.products.fields.name", { ns: "starter" }, "Product")}</FormLabel>
            <FormControl render={<Input {...field} value={field.value ?? ""} placeholder={translate("crm.products.form.name.placeholder", { ns: "starter" }, "e.g. Ergonomic task chair")} />} />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="unit_price"
        rules={{
          required: translate("crm.products.validation.price", { ns: "starter" }, "Enter a list price"),
          min: { value: 0, message: translate("crm.products.validation.priceMin", { ns: "starter" }, "Price cannot be negative") },
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("crm.products.fields.price", { ns: "starter" }, "Unit price")}</FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="active"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel>{translate("crm.products.fields.active", { ns: "starter" }, "Availability")}</FormLabel>
              <p className="text-xs text-muted-foreground">
                {translate("crm.products.form.activeHint", { ns: "starter" }, "Active products are available for new quote items.")}
              </p>
            </div>
            <FormControl render={<Switch checked={Boolean(field.value)} onCheckedChange={(value) => field.onChange(value)} />} />
          </FormItem>
        )}
      />
    </>
  );
}

export const ProductCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.products.drawer.create.title", { ns: "starter" }, "New product")}
        description={translate("crm.products.drawer.create.description", { ns: "starter" }, "Add an SKU to the price book.")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ProductCreateForm translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ProductCreateForm({ translate }: { translate: Translate }) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ProductRecord, HttpError, ProductFormValues>({
    refineCoreProps: {
      resource: "crm_products",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onFinish(values))} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ProductFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.products.form.creating", { ns: "starter" }, "Adding...")
              : translate("crm.products.form.create", { ns: "starter" }, "Add product")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ProductEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.products.drawer.edit.title", { ns: "starter" }, "Edit product")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ProductEditForm recordId={id} translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ProductEditForm({ recordId, translate }: { recordId?: string; translate: Translate }) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ProductRecord, HttpError, ProductFormValues>({
    refineCoreProps: {
      resource: "crm_products",
      action: "edit",
      id: recordId,
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onFinish(values))} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ProductFormFields form={form} translate={translate} />
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
