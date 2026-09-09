import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
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
import type { UseFormReturn } from "react-hook-form";
import { useContextualCloseTo } from "../route-surfaces";
import { AccountPicker } from "../pickers";
import type { ContactFormValues, ContactRecord } from "../types";

type ContactSurfaceProps = {
  presetAccountId?: string;
  idParam?: string;
};

const toServerValues = (values: ContactFormValues) => {
  const { account_id, ...rest } = values;
  return {
    ...rest,
    account: account_id ? Number(account_id) : null,
  } as unknown as ContactFormValues;
};

function ContactFormFields({
  form,
  presetAccountId,
  record,
}: {
  form: UseFormReturn<ContactFormValues>;
  presetAccountId?: string;
  record?: ContactRecord | null;
}) {
  const translate = useTranslate();
  const accountInitial = useMemo(
    () =>
      record?.account?.name
        ? { value: String(record.account.id), label: record.account.name }
        : null,
    [record]
  );
  return (
    <>
      <FormField
        control={form.control}
        name="account_id"
        rules={{
          required: translate(
            "sales.contacts.validation.account",
            { ns: "starter" },
            "Pick the account this contact belongs to"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate(
                "sales.contacts.fields.account",
                { ns: "starter" },
                "Account"
              )}
            </FormLabel>
            <FormControl
              render={
                <AccountPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={Boolean(presetAccountId)}
                  initialOption={accountInitial}
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
            "sales.contacts.validation.name",
            { ns: "starter" },
            "Contact name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("sales.contacts.fields.name", { ns: "starter" }, "Name")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "sales.contacts.placeholder.name",
                    { ns: "starter" },
                    "e.g. Diana Prince"
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
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate(
                "sales.contacts.fields.jobTitle",
                { ns: "starter" },
                "Job title"
              )}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "sales.contacts.placeholder.jobTitle",
                    { ns: "starter" },
                    "e.g. VP of Procurement"
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
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "sales.contacts.fields.email",
                  { ns: "starter" },
                  "Email"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="email"
                    placeholder="name@company.com"
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
                {translate(
                  "sales.contacts.fields.phone",
                  { ns: "starter" },
                  "Phone"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="+1-202-555-0100"
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

export const ContactCreate = ({ presetAccountId }: ContactSurfaceProps) => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const accountId = presetAccountId ?? id;
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "sales.contacts.drawer.create.title",
          { ns: "starter" },
          "New contact"
        )}
        description={translate(
          "sales.contacts.drawer.create.description",
          { ns: "starter" },
          "Add a person you deal with at this account."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ContactCreateForm accountId={accountId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ContactCreateForm({ accountId }: { accountId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ContactRecord, HttpError, ContactFormValues>({
    refineCoreProps: {
      resource: "hub_sales_contacts",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      name: "",
      title: "",
      email: "",
      phone: "",
      account_id: accountId ? String(accountId) : null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ContactFormFields form={form} presetAccountId={accountId} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate(
                  "sales.contacts.form.creating",
                  { ns: "starter" },
                  "Adding..."
                )
              : translate(
                  "sales.contacts.form.create",
                  { ns: "starter" },
                  "Add contact"
                )}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ContactEdit = ({
  presetAccountId,
  idParam = "contactId",
}: ContactSurfaceProps) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const accountId = presetAccountId ?? params.id;
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "sales.contacts.drawer.edit.title",
          { ns: "starter" },
          "Edit contact"
        )}
        description={translate(
          "sales.contacts.drawer.edit.description",
          { ns: "starter" },
          "Update this contact's details."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ContactEditForm recordId={recordId} accountId={accountId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ContactEditForm({
  recordId,
  accountId,
}: {
  recordId?: string;
  accountId?: string;
}) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ContactRecord, HttpError, ContactFormValues>({
    refineCoreProps: {
      resource: "hub_sales_contacts",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["account"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });
  // accountId (derived from a possible parent :id segment) is not used to
  // lock the account field here — editing lets the contact be reassigned to
  // a different account regardless of where the drawer was opened from.
  void accountId;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ContactFormFields form={form} record={query?.data?.data} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("sales.common.saving", { ns: "starter" }, "Saving...")
              : translate("sales.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
