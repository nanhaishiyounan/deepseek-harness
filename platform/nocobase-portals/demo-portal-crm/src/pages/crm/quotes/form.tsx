import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useMemo } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
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
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { QUOTE_STATUSES, labelFor, toDateInputValue } from "../constants";
import { CustomerPicker, DealPicker, makeInitialOption, toPickerValue } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { QuoteRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

type QuoteSurfaceProps = {
  presetCustomerId?: string;
  presetDealId?: string;
};

type QuoteFormValues = {
  quote_number: string;
  status: string;
  issue_date: string | null;
  valid_until: string | null;
  customer_id: string | number | null;
  deal_id: string | number | null;
};

const toServerValues = (values: QuoteFormValues) => {
  const { customer_id, deal_id, ...rest } = values;
  return { ...rest, customer: customer_id, deal: deal_id } as unknown as QuoteFormValues;
};

const suggestedNumber = () => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `Q-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
};

function QuoteFormFields({
  form,
  translate,
  presetCustomerId,
  record,
}: {
  form: UseFormReturn<QuoteFormValues>;
  translate: Translate;
  presetCustomerId?: string;
  record?: QuoteRecord | null;
}) {
  const watchedCustomerId = useWatch({ control: form.control, name: "customer_id" });
  const customerInitial = useMemo(
    () =>
      makeInitialOption(
        record?.customer_id ?? record?.customer?.id,
        record?.customer?.company_name,
        translate("crm.common.customer", { ns: "starter" }, "Customer")
      ),
    [record, translate]
  );
  const dealInitial = useMemo(
    () =>
      makeInitialOption(
        record?.deal_id ?? record?.deal?.id,
        record?.deal?.title,
        translate("crm.common.deal", { ns: "starter" }, "Deal")
      ),
    [record, translate]
  );

  return (
    <>
      <FormField
        control={form.control}
        name="quote_number"
        rules={{ required: translate("crm.quotes.validation.number", { ns: "starter" }, "Quote number is required") }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("crm.quotes.fields.number", { ns: "starter" }, "Quote number")}</FormLabel>
            <FormControl render={<Input {...field} value={field.value ?? ""} placeholder="Q-202608-001" />} />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="customer_id"
        rules={{ required: translate("crm.quotes.validation.customer", { ns: "starter" }, "Pick the customer this quote is for") }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("crm.quotes.fields.customer", { ns: "starter" }, "Customer")}</FormLabel>
            <FormControl
              render={
                <CustomerPicker
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.setValue("deal_id", null);
                  }}
                  disabled={Boolean(presetCustomerId)}
                  initialOption={customerInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="deal_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("crm.quotes.fields.deal", { ns: "starter" }, "Deal")}</FormLabel>
            <FormControl
              render={
                <DealPicker
                  customerId={watchedCustomerId}
                  value={field.value}
                  onChange={field.onChange}
                  initialOption={dealInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("crm.quotes.fields.status", { ns: "starter" }, "Status")}</FormLabel>
            <FormControl
              render={
                <Select value={field.value ?? "draft"} onValueChange={(value) => field.onChange(value ?? "draft")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{labelFor(QUOTE_STATUSES, field.value ?? "draft", translate)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTE_STATUSES.filter(
                      (option) => option.value !== "superseded"
                    ).map((option) => (
                      <SelectItem key={option.value} value={option.value}>{labelFor(QUOTE_STATUSES, option.value, translate)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="issue_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("crm.quotes.fields.issueDate", { ns: "starter" }, "Issue date")}</FormLabel>
              <FormControl render={<Input {...field} value={toDateInputValue(field.value)} type="date" onChange={(event) => field.onChange(event.target.value || null)} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="valid_until"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("crm.quotes.fields.validUntil", { ns: "starter" }, "Valid until")}</FormLabel>
              <FormControl render={<Input {...field} value={toDateInputValue(field.value)} type="date" onChange={(event) => field.onChange(event.target.value || null)} />} />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

export const QuoteCreate = ({ presetCustomerId, presetDealId }: QuoteSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.quotes.drawer.create.title", { ns: "starter" }, "New quote")}
        description={translate("crm.quotes.drawer.create.description", { ns: "starter" }, "Draft a proposal, then add priced line items.")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <QuoteCreateForm translate={translate} presetCustomerId={presetCustomerId} presetDealId={presetDealId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function QuoteCreateForm({ translate, presetCustomerId, presetDealId }: QuoteSurfaceProps & { translate: Translate }) {
  const close = useRouteSurfaceClose();
  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 86400000);
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<QuoteRecord, HttpError, QuoteFormValues>({
    refineCoreProps: {
      resource: "crm_quotes",
      action: "create",
      redirect: false,
      onMutationSuccess: async (response) => {
        const created = response.data;
        await nocobaseClient.action("crm_quotes", "update", {
          query: { filterByTk: created.id },
          body: { root_quote_id: created.id },
        });
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      quote_number: suggestedNumber(),
      status: "draft",
      issue_date: today.toISOString().slice(0, 10),
      valid_until: validUntil.toISOString().slice(0, 10),
      customer_id: presetCustomerId ? String(presetCustomerId) : null,
      deal_id: presetDealId ? String(presetDealId) : null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish({
            ...toServerValues(values),
            version: 1,
            root_quote_id: null,
            is_current: true,
            revision_note: null,
          } as QuoteFormValues)
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <QuoteFormFields form={form} translate={translate} presetCustomerId={presetCustomerId} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.quotes.form.creating", { ns: "starter" }, "Creating...")
              : translate("crm.quotes.form.create", { ns: "starter" }, "Create quote")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const QuoteEdit = ({ idParam = "id" }: { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.quotes.drawer.edit.title", { ns: "starter" }, "Edit quote")}
        description={translate("crm.quotes.drawer.edit.description", { ns: "starter" }, "Update status, dates and links.")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <QuoteEditForm recordId={recordId} translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function QuoteEditForm({ recordId, translate }: { recordId?: string; translate: Translate }) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<QuoteRecord, HttpError, QuoteFormValues>({
    refineCoreProps: {
      resource: "crm_quotes",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["customer", "deal"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  const record = query?.data?.data;
  const readOnly = record?.is_current === false || record?.status === "superseded";
  const { getFieldState, setValue } = form;

  // Re-sync relation ids when the API returns only nested objects; skip any
  // field the user has already touched.
  useEffect(() => {
    if (!record) return;

    if (!getFieldState("customer_id").isDirty) {
      setValue(
        "customer_id",
        toPickerValue(record.customer_id ?? record.customer?.id),
        { shouldDirty: false, shouldTouch: false, shouldValidate: false }
      );
    }

    if (!getFieldState("deal_id").isDirty) {
      setValue(
        "deal_id",
        toPickerValue(record.deal_id ?? record.deal?.id),
        { shouldDirty: false, shouldTouch: false, shouldValidate: false }
      );
    }
  }, [record, getFieldState, setValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          if (readOnly) return;
          return onFinish(toServerValues(values));
        })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {readOnly ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              {translate(
                "crm.quotes.versions.readOnly",
                { ns: "starter" },
                "This previous version is read-only. Return to the current version to make changes or create a new version."
              )}
            </div>
          ) : null}
          <fieldset disabled={readOnly} className="space-y-6">
            <QuoteFormFields form={form} translate={translate} record={record} />
          </fieldset>
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          {!readOnly ? (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? translate("crm.common.saving", { ns: "starter" }, "Saving...")
                : translate("crm.common.save", { ns: "starter" }, "Save changes")}
            </Button>
          ) : null}
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
