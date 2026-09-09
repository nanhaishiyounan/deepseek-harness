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
import { knowledgeRoutes } from "../routes";
import type { CategoryFormValues, CategoryRecord } from "../types";
import { CategoryFormFields } from "./fields";

const toServerValues = (values: CategoryFormValues) => {
  const { parent_id, ...rest } = values;
  return { ...rest, parent: parent_id } as unknown as CategoryFormValues;
};

export const CategoryCreate = () => {
  const translate = useTranslate();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("knowledge.categories.drawer.create.title", { ns: "starter" }, "New category")}
        description={translate(
          "knowledge.categories.drawer.create.description",
          { ns: "starter" },
          "Group articles under a topic. Nest it under a parent to build a tree."
        )}
        closeTo={knowledgeRoutes.categories}
        closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <CategoryCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function CategoryCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<CategoryRecord, HttpError, CategoryFormValues>({
    refineCoreProps: {
      resource: "hub_kb_categories",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: { name: "", description: "", parent_id: null },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <CategoryFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("knowledge.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("knowledge.categories.form.adding", { ns: "starter" }, "Adding...")
              : translate("knowledge.categories.form.add", { ns: "starter" }, "Add category")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const CategoryEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("knowledge.categories.drawer.edit.title", { ns: "starter" }, "Edit category")}
        description={translate(
          "knowledge.categories.drawer.edit.description",
          { ns: "starter" },
          "Rename this category or move it under a different parent."
        )}
        closeTo={knowledgeRoutes.categories}
        closeLabel={translate("knowledge.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <CategoryEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function CategoryEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<CategoryRecord, HttpError, CategoryFormValues>({
    refineCoreProps: {
      resource: "hub_kb_categories",
      action: "edit",
      id,
      redirect: false,
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
          <CategoryFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("knowledge.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("knowledge.common.saving", { ns: "starter" }, "Saving...")
              : translate("knowledge.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
