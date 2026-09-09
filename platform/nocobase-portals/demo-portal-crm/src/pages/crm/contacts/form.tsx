import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { CustomerPicker, makeInitialOption, toPickerValue } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { ContactFormValues, ContactRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

function ContactFormFields({
  form,
  translate,
  record,
  lockCustomer,
}: {
  form: UseFormReturn<ContactFormValues>;
  translate: Translate;
  record?: ContactRecord | null;
  lockCustomer?: boolean;
}) {
  const customerInitial = makeInitialOption(
    record?.customer_id ?? record?.customer?.id,
    record?.customer?.company_name,
    translate("crm.common.customer", { ns: "starter" }, "Customer")
  );

  return (
    <>
      <FormField
        control={form.control}
        name="customer_id"
        rules={{
          required: translate(
            "crm.contacts.validation.customer",
            { ns: "starter" },
            "Pick the company this contact works for"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.contacts.fields.customer", { ns: "starter" }, "Customer")}
            </FormLabel>
            <FormControl
              render={
                <CustomerPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={lockCustomer}
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
        name="name"
        rules={{
          required: translate(
            "crm.contacts.validation.name",
            { ns: "starter" },
            "Name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.contacts.fields.name", { ns: "starter" }, "Name")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "crm.contacts.form.name.placeholder",
                    { ns: "starter" },
                    "e.g. Maya Chen"
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="job_title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.contacts.fields.jobTitle", { ns: "starter" }, "Job title")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "crm.contacts.form.jobTitle.placeholder",
                    { ns: "starter" },
                    "e.g. Office Manager"
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
          name="email"
          rules={{
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: translate(
                "crm.contacts.validation.emailFormat",
                { ns: "starter" },
                "Enter a valid email address"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("crm.contacts.fields.email", { ns: "starter" }, "Email")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="email"
                    placeholder="name@example.com"
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("crm.contacts.fields.phone", { ns: "starter" }, "Phone")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="tel"
                    placeholder="+1-555-0100"
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.contacts.fields.notes", { ns: "starter" }, "Notes")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "crm.contacts.form.notes.placeholder",
                    { ns: "starter" },
                    "Role in the buying decision, preferences..."
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

const defaultValues: ContactFormValues = {
  name: "",
  job_title: "",
  email: "",
  phone: "",
  customer_id: null,
  notes: "",
};

const toServerValues = (values: ContactFormValues) => {
  const { customer_id, ...rest } = values;
  return { ...rest, customer: customer_id } as unknown as ContactFormValues;
};

export const ContactCreate = () => {
  const translate = useTranslate();
  const { id: customerId } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.contacts.drawer.create.title", { ns: "starter" }, "Add contact")}
        description={translate(
          "crm.contacts.drawer.create.description",
          { ns: "starter" },
          "Someone you deal with at this company."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ContactCreateForm customerId={customerId} translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ContactCreateForm({
  customerId,
  translate,
}: {
  customerId?: string;
  translate: Translate;
}) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ContactRecord, HttpError, ContactFormValues>({
    refineCoreProps: {
      resource: "crm_contacts",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      ...defaultValues,
      customer_id: customerId ? String(customerId) : null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ContactFormFields
            form={form}
            translate={translate}
            lockCustomer={Boolean(customerId)}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.contacts.form.creating", { ns: "starter" }, "Adding...")
              : translate("crm.contacts.form.create", { ns: "starter" }, "Add contact")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ContactEdit = () => {
  const translate = useTranslate();
  const { contactId } = useParams<{ contactId: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("crm.contacts.drawer.edit.title", { ns: "starter" }, "Edit contact")}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ContactEditForm recordId={contactId} translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ContactEditForm({
  recordId,
  translate,
}: {
  recordId?: string;
  translate: Translate;
}) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ContactRecord, HttpError, ContactFormValues>({
    refineCoreProps: {
      resource: "crm_contacts",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["customer"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  const record = query?.data?.data;
  const { getFieldState, setValue } = form;

  // Re-sync the relation id in case the API returns only the nested
  // `customer.id`; guard against overwriting the user's own edit.
  useEffect(() => {
    if (!record || getFieldState("customer_id").isDirty) return;

    setValue(
      "customer_id",
      toPickerValue(record.customer_id ?? record.customer?.id),
      { shouldDirty: false, shouldTouch: false, shouldValidate: false }
    );
  }, [record, getFieldState, setValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ContactFormFields
            form={form}
            translate={translate}
            record={record}
          />
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
