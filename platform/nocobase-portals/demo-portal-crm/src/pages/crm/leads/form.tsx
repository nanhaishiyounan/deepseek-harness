import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useParams } from "react-router";
import { AiFillPanel, useAiFill, type AiFillField } from "@/components/ai-fill";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
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
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  MANUAL_LEAD_STATUSES,
  labelFor,
} from "../constants";
import { OwnerPicker, makeInitialOption, toPickerValue } from "../pickers";
import { useContextualCloseTo } from "../route-surfaces";
import { DrawerSection } from "../shared";
import type { LeadRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

type LeadFormValues = {
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  score: number | null;
  owner_id: string | null;
};

const defaultValues: LeadFormValues = {
  name: "",
  company: "",
  email: "",
  phone: "",
  source: "website",
  status: "new",
  score: 0,
  owner_id: null,
};

const toServerValues = (values: LeadFormValues) => {
  const { owner_id, ...rest } = values;
  return { ...rest, owner: owner_id } as unknown as LeadFormValues;
};

function LeadFormFields({
  form,
  translate,
  record,
}: {
  form: UseFormReturn<LeadFormValues>;
  translate: Translate;
  record?: LeadRecord | null;
}) {
  const ownerInitial = makeInitialOption(
    record?.owner_id ?? record?.owner?.id,
    record?.owner?.nickname ?? record?.owner?.email,
    translate("crm.common.owner", { ns: "starter" }, "Owner")
  );

  return (
    <>
      <DrawerSection
        title={translate(
          "crm.forms.sections.person",
          { ns: "starter" },
          "Person"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            rules={{
              required: translate(
                "crm.leads.validation.name",
                { ns: "starter" },
                "Contact name is required"
              ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.name",
                    { ns: "starter" },
                    "Name"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder={translate(
                        "crm.leads.form.name.placeholder",
                        { ns: "starter" },
                        "e.g. Jordan Lee"
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
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.company",
                    { ns: "starter" },
                    "Company"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder={translate(
                        "crm.leads.form.company.placeholder",
                        { ns: "starter" },
                        "e.g. Northwind Studio"
                      )}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            rules={{
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: translate(
                  "crm.leads.validation.emailFormat",
                  { ns: "starter" },
                  "Enter a valid email address"
                ),
              },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.email",
                    { ns: "starter" },
                    "Email"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                      placeholder="name@example.com"
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.phone",
                    { ns: "starter" },
                    "Phone"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="tel"
                      placeholder="+1-555-0100"
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </DrawerSection>

      <DrawerSection
        title={translate(
          "crm.forms.sections.qualification",
          { ns: "starter" },
          "Qualification"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.source",
                    { ns: "starter" },
                    "Source"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Select
                      value={field.value ?? "website"}
                      onValueChange={(value) =>
                        field.onChange(value ?? "website")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {labelFor(
                            LEAD_SOURCES,
                            field.value ?? "website",
                            translate
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {labelFor(LEAD_SOURCES, option.value, translate)}
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
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.status",
                    { ns: "starter" },
                    "Status"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Select
                      value={field.value ?? "new"}
                      onValueChange={(value) => field.onChange(value ?? "new")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {labelFor(
                            LEAD_STATUSES,
                            field.value ?? "new",
                            translate
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {MANUAL_LEAD_STATUSES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {labelFor(MANUAL_LEAD_STATUSES, option.value, translate)}
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

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="score"
            rules={{
              min: {
                value: 0,
                message: translate(
                  "crm.leads.validation.scoreRange",
                  { ns: "starter" },
                  "Score is 0–100"
                ),
              },
              max: {
                value: 100,
                message: translate(
                  "crm.leads.validation.scoreRange",
                  { ns: "starter" },
                  "Score is 0–100"
                ),
              },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.score",
                    { ns: "starter" },
                    "Score"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={0}
                      max={100}
                      placeholder="0"
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? null
                            : Number(event.target.value)
                        )
                      }
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </DrawerSection>

      <DrawerSection
        title={translate(
          "crm.forms.sections.ownership",
          { ns: "starter" },
          "Ownership"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="owner_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.leads.fields.owner",
                    { ns: "starter" },
                    "Owner"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <OwnerPicker
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
        </div>
      </DrawerSection>
    </>
  );
}

export const LeadCreate = () => {
  const translate = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "crm.leads.drawer.create.title",
          { ns: "starter" },
          "New lead"
        )}
        description={translate(
          "crm.leads.drawer.create.description",
          { ns: "starter" },
          "Capture an inbound or prospected contact."
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <LeadCreateForm translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function LeadCreateForm({ translate }: { translate: Translate }) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<LeadRecord, HttpError, LeadFormValues>({
    refineCoreProps: {
      resource: "crm_leads",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues,
  });

  // Allowed values are the same constants the Select inputs below render from,
  // so the model can never write a status or source the form cannot display.
  const aiFields = useMemo<AiFillField[]>(
    () => [
      {
        name: "name",
        title: translate("crm.leads.fields.name", { ns: "starter" }, "Name"),
        type: "string",
        description: "Full name of the person who made contact.",
      },
      {
        name: "company",
        title: translate(
          "crm.leads.fields.company",
          { ns: "starter" },
          "Company"
        ),
        type: "string",
      },
      {
        name: "email",
        title: translate("crm.leads.fields.email", { ns: "starter" }, "Email"),
        type: "string",
        description: "Only when the text contains an email address.",
      },
      {
        name: "phone",
        title: translate("crm.leads.fields.phone", { ns: "starter" }, "Phone"),
        type: "string",
        description: "Only when the text contains a phone number.",
      },
      {
        name: "source",
        title: translate(
          "crm.leads.fields.source",
          { ns: "starter" },
          "Source"
        ),
        type: "string",
        enum: [...LEAD_SOURCES],
      },
      {
        name: "status",
        title: translate(
          "crm.leads.fields.status",
          { ns: "starter" },
          "Status"
        ),
        type: "string",
        enum: [...MANUAL_LEAD_STATUSES],
      },
      {
        name: "score",
        title: translate("crm.leads.fields.score", { ns: "starter" }, "Score"),
        type: "integer",
        description:
          "Interest score from 0 to 100. Higher means a stronger buying signal.",
      },
    ],
    [translate]
  );

  const ai = useAiFill({
    formId: "crm-lead-create",
    title: translate(
      "crm.leads.drawer.create.title",
      { ns: "starter" },
      "Add lead"
    ),
    fields: aiFields,
    getValues: () => form.getValues() as Record<string, unknown>,
    setValues: (values) => {
      for (const [name, value] of Object.entries(values)) {
        form.setValue(name as keyof LeadFormValues, value as never, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    instructions:
      "Use the converted status only when the text says the lead already became a customer. " +
      "A lead that has only just made contact is new.",
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish(toServerValues(values))
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <AiFillPanel
            ai={ai}
            description={translate(
              "crm.leads.form.aiFillDescription",
              { ns: "starter" },
              "Paste the enquiry, business card or call note. AI assist will structure the lead for you."
            )}
            inputLabel={translate(
              "crm.leads.form.aiFillLabel",
              { ns: "starter" },
              "Describe the lead"
            )}
            placeholder={translate(
              "crm.leads.form.aiFillPlaceholder",
              { ns: "starter" },
              "Example: Met Sarah Chen from Brightline Logistics at the trade show; she runs a 40-vehicle fleet and asked for pricing. sarah.chen@brightline.example"
            )}
          />
          <LeadFormFields form={form} translate={translate} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate(
                  "crm.leads.form.creating",
                  { ns: "starter" },
                  "Adding..."
                )
              : translate(
                  "crm.leads.form.create",
                  { ns: "starter" },
                  "Add lead"
                )}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export const LeadEdit = () => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "crm.leads.drawer.edit.title",
          { ns: "starter" },
          "Edit lead"
        )}
        closeTo={closeTo}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        beforeClose={beforeClose}
      >
        <LeadEditForm recordId={id} translate={translate} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function LeadEditForm({
  recordId,
  translate,
}: {
  recordId?: string;
  translate: Translate;
}) {
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<LeadRecord, HttpError, LeadFormValues>({
    refineCoreProps: {
      resource: "crm_leads",
      action: "edit",
      id: recordId,
      redirect: false,
      meta: { appends: ["owner"] },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
  });

  const record = query?.data?.data;
  const { getFieldState, setValue } = form;

  // Defensive re-sync: refine only fills fields whose exact registered path
  // (`owner_id`) exists in the query response. If the API returns only the
  // nested `owner.id`, `owner_id` stays undefined and the picker shows the
  // placeholder even with a valid initialOption. Mirror the id back onto the
  // registered field, but never clobber a value the user is actively editing.
  useEffect(() => {
    if (!record || getFieldState("owner_id").isDirty) return;

    setValue(
      "owner_id",
      toPickerValue(record.owner_id ?? record.owner?.id ?? null),
      { shouldDirty: false, shouldTouch: false, shouldValidate: false }
    );
  }, [record, getFieldState, setValue]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish(toServerValues(values))
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <LeadFormFields form={form} translate={translate} record={record} />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("crm.common.cancel", { ns: "starter" }, "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("crm.common.saving", { ns: "starter" }, "Saving...")
              : translate("crm.common.save", { ns: "starter" }, "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
