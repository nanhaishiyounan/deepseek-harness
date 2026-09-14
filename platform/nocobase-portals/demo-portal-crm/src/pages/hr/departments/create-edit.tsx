import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
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
import { DepartmentPicker } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { DepartmentFormValues, DepartmentRecord } from "../types";

function DepartmentFormFields({
  form,
}: {
  form: UseFormReturn<DepartmentFormValues>;
  selfId?: string;
}) {
  const translate = useTranslate();
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        rules={{
          required: translate(
            "hr.departments.form.nameRequired",
            { ns: "starter" },
            "Department name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("hr.departments.fields.name", { ns: "starter" }, "Department name")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "hr.departments.form.namePlaceholder",
                    { ns: "starter" },
                    "e.g. Backend Engineering"
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
        name="code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("hr.departments.fields.code", { ns: "starter" }, "Code")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "hr.departments.form.codePlaceholder",
                    { ns: "starter" },
                    "e.g. BE"
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
        name="parentId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("hr.departments.fields.parent", { ns: "starter" }, "Parent department")}
            </FormLabel>
            <FormControl
              render={
                <DepartmentPicker
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={translate(
                    "hr.departments.form.parentPlaceholder",
                    { ns: "starter" },
                    "Top level (no parent)"
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

export const DepartmentCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("hr.departments.drawer.create.title", { ns: "starter" }, "Add department")}
        description={translate(
          "hr.departments.drawer.create.description",
          { ns: "starter" },
          "Create a team and optionally nest it under a parent."
        )}
        closeTo={closeTo}
        closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <DepartmentCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function DepartmentCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<DepartmentRecord, HttpError, DepartmentFormValues>({
    refineCoreProps: {
      resource: "hub_hr_departments",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: { name: "", code: "", parentId: null },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <DepartmentFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("hr.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("hr.departments.form.creating", { ns: "starter" }, "Adding...")
              : translate("hr.departments.form.create", { ns: "starter" }, "Add department")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const DepartmentEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("hr.departments.drawer.edit.title", { ns: "starter" }, "Edit department")}
        description={translate(
          "hr.departments.drawer.edit.description",
          { ns: "starter" },
          "Rename or re-parent this team."
        )}
        closeTo={closeTo}
        closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <DepartmentEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function DepartmentEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<DepartmentRecord, HttpError, DepartmentFormValues>({
    refineCoreProps: {
      resource: "hub_hr_departments",
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
          <DepartmentFormFields form={form} selfId={id} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("hr.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("hr.common.saving", { ns: "starter" }, "Saving...")
              : translate("hr.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
