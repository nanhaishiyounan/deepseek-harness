import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { useContextualCloseTo } from "../route-surfaces";
import { money } from "../shared";
import type { InvoiceLineItem, InvoiceItemFormValues } from "../types";

const RESOURCE = "hub_fin_invoice_items";

const DEFAULTS: InvoiceItemFormValues = {
  description: "",
  quantity: "1",
  unit_price: "",
  invoice_id: null,
};

/** Convert the form values into a server payload, computing the line total
 * (amount) from quantity × unit price so the invoice subtotal stays honest. */
function toServerValues(values: InvoiceItemFormValues) {
  const quantity = Number(values.quantity) || 0;
  const unitPrice = Number(values.unit_price) || 0;
  return {
    description: values.description,
    quantity,
    unit_price: unitPrice,
    amount: Math.round(quantity * unitPrice * 100) / 100,
    invoice_id: values.invoice_id ? Number(values.invoice_id) : null,
  };
}

type ItemSurfaceProps = { presetInvoiceId?: string; idParam?: string };

export function ItemCreate({ presetInvoiceId }: ItemSurfaceProps) {
  const t = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={t("finance.invoices.items.drawer.create.title", "Add line item")}
        description={t(
          "finance.invoices.items.drawer.create.desc",
          "Add a billable line to this invoice."
        )}
        closeLabel={t("finance.common.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <ItemCreateForm presetInvoiceId={presetInvoiceId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function ItemCreateForm({ presetInvoiceId }: ItemSurfaceProps) {
  const t = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<InvoiceLineItem, HttpError, InvoiceItemFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      ...DEFAULTS,
      invoice_id: presetInvoiceId ? String(presetInvoiceId) : null,
    },
  });

  return (
    <ItemFormBody
      form={form}
      onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
      close={close}
      submitLabel={t("finance.invoices.items.form.create", "Add item")}
    />
  );
}

export function ItemEdit({ presetInvoiceId, idParam = "itemId" }: ItemSurfaceProps) {
  const t = useTranslate();
  const closeTo = useContextualCloseTo();
  const params = useParams();
  const recordId = params[idParam];
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={t("finance.invoices.items.drawer.edit.title", "Edit line item")}
        description={t(
          "finance.invoices.items.drawer.edit.desc",
          "Update the description, quantity or unit price."
        )}
        closeLabel={t("finance.common.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <ItemEditForm recordId={recordId} presetInvoiceId={presetInvoiceId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function ItemEditForm({
  recordId,
  presetInvoiceId,
}: ItemSurfaceProps & { recordId?: string }) {
  const t = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<InvoiceLineItem, HttpError, InvoiceItemFormValues>({
    refineCoreProps: {
      resource: RESOURCE,
      action: "edit",
      id: recordId,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  const record = query?.data?.data;
  const seeded = useRef(false);
  useEffect(() => {
    if (!record || seeded.current) return;
    seeded.current = true;
    form.reset({
      description: record.description ?? "",
      quantity: record.quantity ?? 1,
      unit_price: record.unit_price ?? "",
      invoice_id: record.invoice_id
        ? String(record.invoice_id)
        : presetInvoiceId
          ? String(presetInvoiceId)
          : null,
    });
  }, [record, form, presetInvoiceId]);

  return (
    <ItemFormBody
      form={form}
      onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
      close={close}
      submitLabel={t("finance.common.save", "Save changes")}
    />
  );
}

function ItemFormBody({
  form,
  onSubmit,
  close,
  submitLabel,
}: {
  form: UseFormReturn<InvoiceItemFormValues>;
  onSubmit: (event: React.FormEvent) => void;
  close: ReturnType<typeof useRouteSurfaceClose>;
  submitLabel: string;
}) {
  const t = useTranslate();
  const quantity = Number(form.watch("quantity")) || 0;
  const unitPrice = Number(form.watch("unit_price")) || 0;
  const lineTotal = Math.round(quantity * unitPrice * 100) / 100;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10">
          <TextField
            form={form}
            name="description"
            label={t("finance.invoices.items.field.description", "Description")}
            required
            placeholder={t("finance.invoices.items.placeholder.description", "Consulting services")}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              form={form}
              name="quantity"
              label={t("finance.invoices.items.field.quantity", "Quantity")}
              type="number"
              required
              placeholder="1"
            />
            <TextField
              form={form}
              name="unit_price"
              label={t("finance.invoices.items.field.unitPrice", "Unit price (USD)")}
              type="number"
              required
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t("finance.invoices.items.lineTotal", "Line total")}
            </span>
            <span className="font-medium tabular-nums">{money(lineTotal, true)}</span>
          </div>
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {t("finance.common.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? t("finance.common.saving", "Saving…")
              : submitLabel}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

function TextField({
  form,
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  form: UseFormReturn<InvoiceItemFormValues>;
  name: keyof InvoiceItemFormValues;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const t = useTranslate();
  return (
    <FormField
      control={form.control}
      name={name}
      rules={
        required
          ? {
              required: t(
                "finance.common.fieldRequired",
                { ns: "starter", field: label },
                `${label} is required`
              ),
            }
          : undefined
      }
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl
            render={
              <Input
                {...field}
                value={field.value ?? ""}
                type={type}
                placeholder={placeholder}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
