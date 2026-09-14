import { type HttpError, useList, useTranslate } from "@refinedev/core";
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
import { toDateInputValue } from "../constants";
import { ProjectPicker } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { MilestoneFormValues, MilestoneRecord, ProjectRecord } from "../types";
import { milestoneTransitionValues } from "../transitions";

const toServerValues = (
  values: MilestoneFormValues,
  record?: MilestoneRecord | null
) => {
  const { project_id, ...rest } = values;
  return {
    ...rest,
    ...milestoneTransitionValues(values.done, record),
    project: project_id,
  } as unknown as MilestoneFormValues;
};

function MilestoneFormFields({
  form,
  presetProjectId,
  record,
}: {
  form: UseFormReturn<MilestoneFormValues>;
  presetProjectId?: string;
  record?: MilestoneRecord | null;
}) {
  const translate = useTranslate();
  const projectId = form.watch("project_id");
  const selectedProject = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 1 },
    filters: [{ field: "id", operator: "eq", value: projectId }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(projectId), retry: false },
  }).result.data[0];
  const projectInitial = record?.project
    ? { value: String(record.project.id), label: record.project.name ?? "—" }
    : null;

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        rules={{
          required: translate(
            "projects.milestones.fields.name.required",
            { ns: "starter" },
            "Milestone name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("projects.milestones.fields.name", { ns: "starter" }, "Milestone")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "projects.milestones.fields.name.placeholder",
                    { ns: "starter" },
                    "e.g. Production launch"
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
        name="project_id"
        rules={{
          required: translate(
            "projects.milestones.fields.project.required",
            { ns: "starter" },
            "Pick the project this milestone belongs to"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("projects.milestones.fields.project", { ns: "starter" }, "Project")}
            </FormLabel>
            <FormControl
              render={
                <ProjectPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={Boolean(presetProjectId)}
                  initialOption={projectInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="due_date"
        rules={{
          validate: (value) =>
            !value ||
            !selectedProject ||
            !(
              (selectedProject.start_date &&
                value < selectedProject.start_date.slice(0, 10)) ||
              (selectedProject.due_date &&
                value > selectedProject.due_date.slice(0, 10))
            ) ||
            translate(
              "projects.milestones.fields.targetDate.outsideProject",
              { ns: "starter" },
              "Target date must fall within the selected project's date range"
            ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("projects.milestones.fields.targetDate", { ns: "starter" }, "Target date")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={toDateInputValue(field.value)}
                  type="date"
                  onChange={(event) => field.onChange(event.target.value || null)}
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
          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4">
            <FormControl
              render={
                <Checkbox
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                />
              }
            />
            <div className="space-y-0.5">
              <FormLabel className="cursor-pointer">
                {translate("projects.milestones.fields.completed", { ns: "starter" }, "Completed")}
              </FormLabel>
              <p className="text-xs text-muted-foreground">
                {translate(
                  "projects.milestones.fields.completed.hint",
                  { ns: "starter" },
                  "Mark this milestone as reached."
                )}
              </p>
            </div>
          </FormItem>
        )}
      />
    </>
  );
}

type MilestoneSurfaceProps = { presetProjectId?: string };

export const MilestoneCreate = ({ presetProjectId }: MilestoneSurfaceProps) => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("projects.milestones.drawer.create.title", { ns: "starter" }, "New milestone")}
        description={translate(
          "projects.milestones.drawer.create.desc",
          { ns: "starter" },
          "Add a milestone to track a key date."
        )}
        closeTo={closeTo}
        closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <MilestoneCreateForm presetProjectId={presetProjectId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function MilestoneCreateForm({ presetProjectId }: MilestoneSurfaceProps) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<MilestoneRecord, HttpError, MilestoneFormValues>({
    refineCoreProps: {
      resource: "hub_pj_milestones",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      name: "",
      due_date: null,
      done: false,
      project_id: presetProjectId ? String(presetProjectId) : null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(toServerValues(values)))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <MilestoneFormFields form={form} presetProjectId={presetProjectId} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("projects.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("projects.milestones.actions.adding", { ns: "starter" }, "Adding...")
              : translate("projects.milestones.actions.add", { ns: "starter" }, "Add milestone")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const MilestoneEdit = ({
  presetProjectId,
  idParam = "id",
}: MilestoneSurfaceProps & { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("projects.milestones.drawer.edit.title", { ns: "starter" }, "Edit milestone")}
        description={translate(
          "projects.milestones.drawer.edit.desc",
          { ns: "starter" },
          "Update the target date or completion."
        )}
        closeTo={closeTo}
        closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <MilestoneEditForm recordId={recordId} presetProjectId={presetProjectId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function MilestoneEditForm({
  recordId,
  presetProjectId,
}: MilestoneSurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<MilestoneRecord, HttpError, MilestoneFormValues>({
    refineCoreProps: {
      resource: "hub_pj_milestones",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["project"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  const record = query?.data?.data;
  const seeded = useRef(false);
  useEffect(() => {
    if (!record || seeded.current) return;
    seeded.current = true;
    form.reset({
      name: record.name ?? "",
      due_date: record.due_date ?? null,
      done: Boolean(record.done),
      project_id: record.project ? String(record.project.id) : null,
    });
  }, [record, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish(toServerValues(values, record))
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <MilestoneFormFields
            form={form}
            presetProjectId={presetProjectId}
            record={record}
          />
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
