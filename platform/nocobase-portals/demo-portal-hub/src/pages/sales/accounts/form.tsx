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
import type { AccountFormValues, AccountRecord } from "../types";
import { AccountFormFields } from "./fields";

const toServerValues = (values: AccountFormValues) => {
  const { owner_id, ...rest } = values;
  return {
    ...rest,
    owner: owner_id ? Number(owner_id) : null,
  } as unknown as AccountFormValues;
};

export const AccountCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "sales.accounts.drawer.create.title",
          { ns: "starter" },
          "New account"
        )}
        description={translate(
          "sales.accounts.drawer.create.description",
          { ns: "starter" },
          "Add a client company to your book of business."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <AccountCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function AccountCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<AccountRecord, HttpError, AccountFormValues>({
    refineCoreProps: {
      resource: "hub_sales_accounts",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      name: "",
      industry: null,
      website: "",
      owner_id: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AccountFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("sales.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate(
                  "sales.accounts.form.creating",
                  { ns: "starter" },
                  "Adding..."
                )
              : translate(
                  "sales.accounts.form.create",
                  { ns: "starter" },
                  "Add account"
                )}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const AccountEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "sales.accounts.drawer.edit.title",
          { ns: "starter" },
          "Edit account"
        )}
        description={translate(
          "sales.accounts.drawer.edit.description",
          { ns: "starter" },
          "Update this account's profile."
        )}
        closeTo={closeTo}
        closeLabel={translate("sales.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <AccountEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function AccountEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<AccountRecord, HttpError, AccountFormValues>({
    refineCoreProps: {
      resource: "hub_sales_accounts",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["owner"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AccountFormFields form={form} record={query?.data?.data} />
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
