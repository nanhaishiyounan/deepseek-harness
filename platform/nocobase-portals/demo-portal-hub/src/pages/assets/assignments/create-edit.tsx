import {
  type HttpError,
  useDelete,
  useNotification,
  useTranslate,
  useUpdate,
} from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useRef } from "react";
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
import { todayIso, toDateInputValue } from "../constants";
import type {
  AssetRecord,
  AssignmentFormValues,
  AssignmentRecord,
} from "../types";
import { AssignmentFormFields } from "./fields";
import { runAssignmentAssetTransition } from "./transitions";

// --- General create (from the Assignments list) -----------------------------

export const AssignmentCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.assignments.drawer.create.title", { ns: "starter" }, "Assign a device")}
        description={translate(
          "assets.assignments.drawer.create.description",
          { ns: "starter" },
          "Hand an in-stock asset to a member of staff."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <AssignmentForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

// --- Nested assign (from an asset's detail drawer) --------------------------

export const AssetNestedAssign = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.assignments.drawer.nestedAssign.title", { ns: "starter" }, "Assign this device")}
        description={translate(
          "assets.assignments.drawer.nestedAssign.description",
          { ns: "starter" },
          "Record who is taking this asset and when."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <AssignmentForm presetAssetId={id} lockAsset />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function AssignmentForm({
  presetAssetId,
  lockAsset = false,
}: {
  presetAssetId?: string;
  lockAsset?: boolean;
}) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const notify = useNotification();
  const { mutateAsync: updateAsset } = useUpdate<AssetRecord>();
  const { mutateAsync: deleteAssignment } = useDelete<AssignmentRecord>();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<AssignmentRecord, HttpError, AssignmentFormValues>({
    refineCoreProps: {
      resource: "hub_as_assignments",
      action: "create",
      redirect: false,
      successNotification: false,
      onMutationSuccess: async (data) => {
        const assignmentId = data?.data?.id;
        const assetId =
          presetAssetId ?? (data?.data?.asset_id as string | number | undefined);
        try {
          await runAssignmentAssetTransition({
            updateAssignment: () => Promise.resolve(),
            updateAsset: () =>
              assetId == null
                ? Promise.resolve()
                : updateAsset({
                    resource: "hub_as_assets",
                    id: assetId,
                    values: { status: "assigned" },
                    successNotification: false,
                  }),
            rollbackAssignment: () =>
              assignmentId == null
                ? Promise.resolve()
                : deleteAssignment({
                    resource: "hub_as_assignments",
                    id: assignmentId,
                    successNotification: false,
                  }),
          });
          close({ skipBeforeClose: true });
        } catch {
          notify.open?.({
            type: "error",
            message: translate(
              "assets.assignments.createFailed",
              { ns: "starter" },
              "The asset status could not be updated, so the new assignment was rolled back."
            ),
          });
        }
      },
    },
    defaultValues: {
      asset_id: presetAssetId ?? null,
      assignee_id: null,
      assigned_date: todayIso(),
      returned_date: null,
      note: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AssignmentFormFields form={form} lockAsset={lockAsset} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("assets.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("assets.assignments.form.creating", { ns: "starter" }, "Assigning...")
              : translate("assets.assignments.form.create", { ns: "starter" }, "Assign device")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

// --- Edit (from the Assignments list) ---------------------------------------

export const AssignmentEdit = ({
  idParam = "id",
}: { idParam?: string } = {}) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const id = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.assignments.drawer.edit.title", { ns: "starter" }, "Edit assignment")}
        description={translate(
          "assets.assignments.drawer.edit.description",
          { ns: "starter" },
          "Update the assignment details or record a return."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <AssignmentEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function AssignmentEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const notify = useNotification();
  const { mutateAsync: updateAsset } = useUpdate<AssetRecord>();
  const { mutateAsync: restoreAssignment } = useUpdate<AssignmentRecord>();
  const original = useRef<AssignmentRecord | null>(null);
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<AssignmentRecord, HttpError, AssignmentFormValues>({
    refineCoreProps: {
      resource: "hub_as_assignments",
      action: "edit",
      id,
      redirect: false,
      successNotification: false,
      onMutationSuccess: async (data) => {
        const record = data?.data as AssignmentRecord | undefined;
        const assetId = record?.asset_id ?? form.getValues("asset_id");
        const returned = form.getValues("returned_date");
        try {
          await runAssignmentAssetTransition({
            updateAssignment: () => Promise.resolve(),
            updateAsset: () =>
              assetId == null
                ? Promise.resolve()
                : updateAsset({
                    resource: "hub_as_assets",
                    id: assetId,
                    values: { status: returned ? "in_stock" : "assigned" },
                    successNotification: false,
                  }),
            rollbackAssignment: () => {
              const previous = original.current;
              return previous
                ? restoreAssignment({
                    resource: "hub_as_assignments",
                    id: previous.id,
                    values: {
                      asset_id: previous.asset_id ?? null,
                      assignee_id: previous.assignee_id ?? null,
                      assigned_date: previous.assigned_date ?? null,
                      returned_date: previous.returned_date ?? null,
                      note: previous.note ?? "",
                    },
                    successNotification: false,
                  })
                : Promise.resolve();
            },
          });
          close({ skipBeforeClose: true });
        } catch {
          notify.open?.({
            type: "error",
            message: translate(
              "assets.assignments.editFailed",
              { ns: "starter" },
              "The asset status could not be updated, so the assignment changes were restored."
            ),
          });
        }
      },
    },
  });

  useEffect(() => {
    if (!original.current && query?.data?.data) {
      original.current = query.data.data;
    }
  }, [query?.data?.data]);

  // Normalize loaded ISO dates for the native date inputs.
  const assignedValue = form.watch("assigned_date");
  const returnedValue = form.watch("returned_date");
  useEffect(() => {
    if (assignedValue && assignedValue.length > 10) {
      form.setValue("assigned_date", toDateInputValue(assignedValue));
    }
  }, [assignedValue, form]);
  useEffect(() => {
    if (returnedValue && returnedValue.length > 10) {
      form.setValue("returned_date", toDateInputValue(returnedValue));
    }
  }, [returnedValue, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AssignmentFormFields form={form} showReturned lockAsset />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("assets.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("assets.common.saving", { ns: "starter" }, "Saving...")
              : translate("assets.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
