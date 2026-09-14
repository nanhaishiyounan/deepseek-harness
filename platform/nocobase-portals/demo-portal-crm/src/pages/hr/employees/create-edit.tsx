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
import type { EmployeeFormValues, EmployeeRecord } from "../types";
import { EmployeeFormFields } from "./fields";

export const EmployeeCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("hr.employees.drawer.create.title", { ns: "starter" }, "Add employee")}
        description={translate(
          "hr.employees.drawer.create.description",
          { ns: "starter" },
          "Add someone to the team directory."
        )}
        closeTo={closeTo}
        closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <EmployeeCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function EmployeeCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<EmployeeRecord, HttpError, EmployeeFormValues>({
    refineCoreProps: {
      resource: "hub_hr_employees",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      name: "",
      email: "",
      job_title: "",
      status: "active",
      hire_date: null,
      department_id: null,
      manager_id: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <EmployeeFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("hr.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("hr.employees.form.creating", { ns: "starter" }, "Adding...")
              : translate("hr.employees.form.create", { ns: "starter" }, "Add employee")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const EmployeeEdit = ({
  idParam = "id",
}: {
  idParam?: string;
} = {}) => {
  const translate = useTranslate();
  const params = useParams();
  const id = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("hr.employees.drawer.edit.title", { ns: "starter" }, "Edit employee")}
        description={translate(
          "hr.employees.drawer.edit.description",
          { ns: "starter" },
          "Update this person's profile."
        )}
        closeTo={closeTo}
        closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <EmployeeEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function EmployeeEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<EmployeeRecord, HttpError, EmployeeFormValues>({
    refineCoreProps: {
      resource: "hub_hr_employees",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["department", "manager"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish({ ...values, hire_date: values.hire_date || null })
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <EmployeeFormFields form={form} employeeId={id} />
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
