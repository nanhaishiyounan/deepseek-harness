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
import type { LeaveRequestFormValues, LeaveRequestRecord } from "../types";
import { LeaveFormFields } from "./fields";

const normalize = (values: LeaveRequestFormValues) => ({
  ...values,
  start_date: values.start_date || null,
  end_date: values.end_date || null,
});

type LeaveSurfaceProps = {
  presetEmployeeId?: string;
};

export const LeaveCreate = ({ presetEmployeeId }: LeaveSurfaceProps = {}) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("hr.leave.drawer.create.title", { ns: "starter" }, "New leave request")}
        description={translate(
          "hr.leave.drawer.create.description",
          { ns: "starter" },
          "Log time off for a team member."
        )}
        closeTo={closeTo}
        closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <LeaveCreateForm presetEmployeeId={presetEmployeeId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function LeaveCreateForm({ presetEmployeeId }: LeaveSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<LeaveRequestRecord, HttpError, LeaveRequestFormValues>({
    refineCoreProps: {
      resource: "hub_hr_leave_requests",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      employee_id: presetEmployeeId ? String(presetEmployeeId) : null,
      type: "annual",
      start_date: null,
      end_date: null,
      days: null,
      reason: "",
      status: "pending",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(normalize(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <LeaveFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("hr.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("hr.common.saving", { ns: "starter" }, "Saving...")
              : translate("hr.leave.form.create", { ns: "starter" }, "Create request")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const LeaveEdit = ({
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
        title={translate("hr.leave.drawer.edit.title", { ns: "starter" }, "Edit leave request")}
        description={translate(
          "hr.leave.drawer.edit.description",
          { ns: "starter" },
          "Update the details of this request."
        )}
        closeTo={closeTo}
        closeLabel={translate("hr.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <LeaveEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function LeaveEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<LeaveRequestRecord, HttpError, LeaveRequestFormValues>({
    refineCoreProps: {
      resource: "hub_hr_leave_requests",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["employee"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(normalize(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <LeaveFormFields form={form} leaveId={id} />
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
