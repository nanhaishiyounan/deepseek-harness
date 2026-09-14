import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect } from "react";
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
import { toDateInputValue, todayIso } from "../constants";
import type { MaintenanceFormValues, MaintenanceRecord } from "../types";
import { MaintenanceFormFields } from "./fields";

// --- General create (from the Maintenance list) -----------------------------

export const MaintenanceCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.maintenance.drawer.create.title", { ns: "starter" }, "Log maintenance")}
        description={translate(
          "assets.maintenance.drawer.create.description",
          { ns: "starter" },
          "Record scheduled or completed work on a device."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <MaintenanceForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

// --- Nested create (from an asset's detail drawer) --------------------------

export const AssetNestedMaintenance = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("assets.maintenance.drawer.nestedCreate.title", { ns: "starter" }, "Log maintenance")}
        description={translate(
          "assets.maintenance.drawer.nestedCreate.description",
          { ns: "starter" },
          "Record work on this device."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <MaintenanceForm presetAssetId={id} lockAsset />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function MaintenanceForm({
  presetAssetId,
  lockAsset = false,
}: {
  presetAssetId?: string;
  lockAsset?: boolean;
}) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<MaintenanceRecord, HttpError, MaintenanceFormValues>({
    refineCoreProps: {
      resource: "hub_as_maintenance",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      title: "",
      assetId: presetAssetId ?? null,
      type: "Preventive",
      status: "Scheduled",
      scheduled_date: todayIso(),
      completed_date: null,
      cost: null,
      vendor: "",
      notes: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <MaintenanceFormFields form={form} lockAsset={lockAsset} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("assets.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("assets.maintenance.form.creating", { ns: "starter" }, "Saving...")
              : translate("assets.maintenance.form.create", { ns: "starter" }, "Log maintenance")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

// --- Edit -------------------------------------------------------------------

export const MaintenanceEdit = ({
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
        title={translate("assets.maintenance.drawer.edit.title", { ns: "starter" }, "Edit maintenance")}
        description={translate(
          "assets.maintenance.drawer.edit.description",
          { ns: "starter" },
          "Update this maintenance record."
        )}
        closeLabel={translate("assets.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <MaintenanceEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function MaintenanceEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<MaintenanceRecord, HttpError, MaintenanceFormValues>({
    refineCoreProps: {
      resource: "hub_as_maintenance",
      action: "edit",
      id,
      redirect: false,
      meta: { appends: ["asset"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  // Normalize loaded ISO dates for the native date inputs.
  const scheduledValue = form.watch("scheduled_date");
  const completedValue = form.watch("completed_date");
  useEffect(() => {
    if (scheduledValue && scheduledValue.length > 10) {
      form.setValue("scheduled_date", toDateInputValue(scheduledValue));
    }
  }, [scheduledValue, form]);
  useEffect(() => {
    if (completedValue && completedValue.length > 10) {
      form.setValue("completed_date", toDateInputValue(completedValue));
    }
  }, [completedValue, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <MaintenanceFormFields form={form} />
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
