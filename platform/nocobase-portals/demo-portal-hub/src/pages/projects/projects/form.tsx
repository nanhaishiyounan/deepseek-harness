import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useRef } from "react";
import { type UseFormReturn } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { PROJECT_STATUSES, labelFor, toDateInputValue } from "../constants";
import { UserPicker } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import type { ProjectFormValues, ProjectRecord } from "../types";
import { projectTransitionValues } from "../transitions";

const toServerValues = (values: ProjectFormValues, record?: ProjectRecord | null) => {
  const { owner_id, ...rest } = values;
  return {
    ...rest,
    ...projectTransitionValues(values.status, record),
    owner: owner_id,
  } as unknown as ProjectFormValues;
};

function ProjectFormFields({
  form,
  record,
}: {
  form: UseFormReturn<ProjectFormValues>;
  record?: ProjectRecord | null;
}) {
  const translate = useTranslate();
  const ownerInitial = record?.owner
    ? {
        value: String(record.owner.id),
        label: record.owner.nickname || record.owner.username || "—",
      }
    : null;

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="name"
          rules={{
            required: translate(
              "projects.projects.fields.name.required",
              { ns: "starter" },
              "Project name is required"
            ),
          }}
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>
                {translate("projects.projects.fields.name", { ns: "starter" }, "Project name")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "projects.projects.fields.name.placeholder",
                      { ns: "starter" },
                      "e.g. Phoenix Platform Rebuild"
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
                {translate("projects.projects.fields.code", { ns: "starter" }, "Code")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "projects.projects.fields.code.placeholder",
                      { ns: "starter" },
                      "PRJ-001"
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
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("projects.projects.fields.status", { ns: "starter" }, "Status")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "planning"}
                    onValueChange={(value) => field.onChange(value ?? "planning")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(PROJECT_STATUSES, field.value ?? "planning", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {translate(status.i18nKey, { ns: "starter" }, status.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="owner_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("projects.projects.fields.owner", { ns: "starter" }, "Owner")}
            </FormLabel>
            <FormControl
              render={
                <UserPicker
                  value={field.value}
                  onChange={field.onChange}
                  initialOption={ownerInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("projects.projects.fields.startDate", { ns: "starter" }, "Start date")}
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
          name="due_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("projects.projects.fields.dueDate", { ns: "starter" }, "Due date")}
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
      </div>
    </>
  );
}

export const ProjectCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("projects.projects.drawer.create.title", { ns: "starter" }, "New project")}
        description={translate(
          "projects.projects.drawer.create.desc",
          { ns: "starter" },
          "Spin up a new project."
        )}
        closeTo={closeTo}
        closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ProjectCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ProjectCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<ProjectRecord, HttpError, ProjectFormValues>({
    refineCoreProps: {
      resource: "hub_pj_projects",
      action: "create",
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: {
      name: "",
      code: "",
      status: "planning",
      start_date: null,
      due_date: null,
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
          <ProjectFormFields form={form} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("projects.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("projects.projects.actions.creating", { ns: "starter" }, "Creating...")
              : translate("projects.projects.actions.create", { ns: "starter" }, "Create project")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const ProjectEdit = ({ idParam = "id" }: { idParam?: string }) => {
  const translate = useTranslate();
  const params = useParams<Record<string, string>>();
  const recordId = params[idParam];
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate("projects.projects.drawer.edit.title", { ns: "starter" }, "Edit project")}
        description={translate(
          "projects.projects.drawer.edit.desc",
          { ns: "starter" },
          "Update scope, status and timing."
        )}
        closeTo={closeTo}
        closeLabel={translate("projects.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <ProjectEditForm recordId={recordId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ProjectEditForm({ recordId }: { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ProjectRecord, HttpError, ProjectFormValues>({
    refineCoreProps: {
      resource: "hub_pj_projects",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["owner"] },
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
      code: record.code ?? "",
      status: record.status ?? "planning",
      start_date: record.start_date ?? null,
      due_date: record.due_date ?? null,
      owner_id: record.owner ? String(record.owner.id) : null,
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
          <ProjectFormFields form={form} record={record} />
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
