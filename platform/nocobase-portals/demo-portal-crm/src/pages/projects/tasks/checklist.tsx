import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useRef } from "react";
import { type UseFormReturn } from "react-hook-form";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useContextualCloseTo } from "../route-surfaces";
import type { ChecklistFormValues, ChecklistRecord } from "../types";

const toServerValues = (values: ChecklistFormValues) => {
  const { task_id, ...rest } = values;
  return { ...rest, task: task_id } as unknown as ChecklistFormValues;
};

function ChecklistFormFields({
  form,
}: {
  form: UseFormReturn<ChecklistFormValues>;
}) {
  const translate = useTranslate();
  return (
    <>
      <FormField
        control={form.control}
        name="title"
        rules={{
          required: translate(
            "projects.tasks.checklist.fields.title.required",
            { ns: "starter" },
            "Checklist item text is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("projects.tasks.checklist.item", { ns: "starter" }, "Item")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "projects.tasks.checklist.fields.title.placeholder",
                    { ns: "starter" },
                    "e.g. Write test cases"
                  )}
                  autoFocus
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="done"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2 space-y-0">
            <FormControl
              render={
                <Checkbox
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                />
              }
            />
            <FormLabel className="!mt-0">
              {translate("projects.tasks.checklist.fields.done", { ns: "starter" }, "Done")}
            </FormLabel>
          </FormItem>
        )}
      />
    </>
  );
}

type ChecklistSurfaceProps = { presetTaskId?: string };

export const ChecklistCreate = ({ presetTaskId }: ChecklistSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "projects.tasks.checklist.drawer.create.title",
          { ns: "starter" },
          "New checklist item"
        )}
        description={translate(
          "projects.tasks.checklist.drawer.create.desc",
          { ns: "starter" },
          "Add a step to this task's checklist."
        )}
        closeTo={closeTo}
        closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ChecklistCreateForm presetTaskId={presetTaskId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ChecklistCreateForm({ presetTaskId }: ChecklistSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ChecklistRecord, HttpError, ChecklistFormValues>({
    refineCoreProps: {
      resource: "hub_pj_checklist",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      title: "",
      done: false,
      task_id: presetTaskId ? String(presetTaskId) : null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ChecklistFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("projects.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("projects.tasks.checklist.actions.adding", { ns: "starter" }, "Adding...")
              : translate("projects.tasks.checklist.actions.add", { ns: "starter" }, "Add item")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ChecklistEdit = ({ presetTaskId }: ChecklistSurfaceProps) => {
  const translate = useTranslate();
  const { itemId } = useParams<{ itemId: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "projects.tasks.checklist.drawer.edit.title",
          { ns: "starter" },
          "Edit checklist item"
        )}
        description={translate(
          "projects.tasks.checklist.drawer.edit.desc",
          { ns: "starter" },
          "Update the checklist item text or status."
        )}
        closeTo={closeTo}
        closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ChecklistEditForm recordId={itemId} presetTaskId={presetTaskId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ChecklistEditForm({
  recordId,
  presetTaskId,
}: ChecklistSurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ChecklistRecord, HttpError, ChecklistFormValues>({
    refineCoreProps: {
      resource: "hub_pj_checklist",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["task"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  const record = query?.data?.data;
  const seeded = useRef(false);
  useEffect(() => {
    if (!record || seeded.current) return;
    seeded.current = true;
    form.reset({
      title: record.title ?? "",
      done: Boolean(record.done),
      task_id: record.task ? String(record.task.id) : presetTaskId ? String(presetTaskId) : null,
    });
  }, [record, form, presetTaskId]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ChecklistFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("projects.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("projects.common.saving", { ns: "starter" }, "Saving...")
              : translate("projects.common.saveChanges", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
