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
import type { StockMoveFormValues, StockMoveRecord } from "../types";
import { StockMoveFormFields } from "./fields";

type StockMoveSurfaceProps = {
  presetProductId?: string;
};

export const StockMoveCreate = ({ presetProductId }: StockMoveSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("inventory.stockMoves.drawer.create.title", { ns: "starter" }, "New stock move")}
        description={translate(
          "inventory.stockMoves.drawer.create.description",
          { ns: "starter" },
          "Record a receipt, issue or adjustment."
        )}
        closeTo={closeTo}
        closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <StockMoveFormBody mode="create" presetProductId={presetProductId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

export const StockMoveEdit = ({
  presetProductId,
  idParam = "id",
}: StockMoveSurfaceProps & { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("inventory.stockMoves.drawer.edit.title", { ns: "starter" }, "Edit stock move")}
        description={translate(
          "inventory.stockMoves.drawer.edit.description",
          { ns: "starter" },
          "Update this movement."
        )}
        closeTo={closeTo}
        closeLabel={translate("inventory.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <StockMoveFormBody
          mode="edit"
          recordId={recordId}
          presetProductId={presetProductId}
        />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function StockMoveFormBody({
  mode,
  recordId,
  presetProductId,
}: {
  mode: "create" | "edit";
  recordId?: string;
  presetProductId?: string;
}) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<StockMoveRecord, HttpError, StockMoveFormValues>({
    refineCoreProps: {
      resource: "hub_inv_stock_moves",
      action: mode,
      id: recordId,
      redirect: false,
      meta: mode === "edit" ? { appends: ["product", "warehouse"] } : undefined,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      type: "in",
      qty: null,
      moved_at: new Date().toISOString(),
      note: "",
      product_id: presetProductId ? String(presetProductId) : null,
      warehouse_id: null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10">
          <StockMoveFormFields
            form={form}
            translate={translate}
            presetProductId={presetProductId}
            record={mode === "edit" ? query?.data?.data : undefined}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("inventory.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("inventory.common.saving", { ns: "starter" }, "Saving…")
              : mode === "create"
                ? translate("inventory.stockMoves.form.create", { ns: "starter" }, "Record move")
                : translate("inventory.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
