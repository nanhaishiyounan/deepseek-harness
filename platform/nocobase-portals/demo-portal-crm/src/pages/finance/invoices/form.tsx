import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import type { UseFormReturn } from "react-hook-form";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { INVOICE_STATUSES, optionLabel } from "../constants";
import { useContextualCloseTo } from "../route-surfaces";
import type { Invoice, InvoiceFormValues } from "../types";
import { writableInvoiceStatus } from "../invoice-metrics";

const DEFAULTS: InvoiceFormValues = {
  invoice_number: "",
  client_name: "",
  amount: "",
  issue_date: "",
  due_date: "",
  status: "draft",
};

export function InvoiceCreate() {
  const t = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={t("finance.invoices.drawer.create.title", "New invoice")}
        description={t(
          "finance.invoices.drawer.create.desc",
          "Issue a new invoice to a client."
        )}
        closeLabel={t("finance.common.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <InvoiceForm mode="create" />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

export function InvoiceEdit() {
  const t = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={t("finance.invoices.drawer.edit.title", "Edit invoice")}
        description={t(
          "finance.invoices.drawer.edit.desc",
          "Update invoice details or status."
        )}
        closeLabel={t("finance.common.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <InvoiceForm mode="edit" />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function InvoiceForm({ mode }: { mode: "create" | "edit" }) {
  const t = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<Invoice, HttpError, InvoiceFormValues>({
    refineCoreProps: {
      resource: "hub_fin_invoices",
      action: mode,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: DEFAULTS,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish({
            ...values,
            amount: Number(values.amount) || 0,
            status: writableInvoiceStatus(values.status),
          })
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10">
          <TextField
            form={form}
            name="invoice_number"
            label={t("finance.invoices.field.number", "Invoice #")}
            required
            placeholder="INV-1042"
          />
          <TextField
            form={form}
            name="client_name"
            label={t("finance.invoices.field.client", "Client")}
            required
            placeholder="Acme Corp"
          />
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t(
              "finance.invoices.form.amountDerived",
              "Invoice total is derived from line items and is not edited on the header."
            )}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              form={form}
              name="issue_date"
              label={t("finance.invoices.field.issueDate", "Issue date")}
              type="date"
            />
            <TextField
              form={form}
              name="due_date"
              label={t("finance.invoices.field.dueDate", "Due date")}
              type="date"
            />
          </div>
          <StatusField form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {t("finance.common.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? t("finance.common.saving", "Saving…")
              : mode === "create"
                ? t("finance.invoices.form.create", "Create invoice")
                : t("finance.common.save", "Save changes")}
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
  form: UseFormReturn<InvoiceFormValues>;
  name: keyof InvoiceFormValues;
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

function StatusField({ form }: { form: UseFormReturn<InvoiceFormValues> }) {
  const t = useTranslate();
  return (
    <FormField
      control={form.control}
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("finance.invoices.field.status", "Status")}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("finance.invoices.field.statusPlaceholder", "Select status")} />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_STATUSES.filter((option) => option.value !== "overdue").map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {optionLabel(option, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
