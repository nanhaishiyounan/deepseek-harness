import { type useTranslate } from "@refinedev/core";
import type { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  labelFor,
} from "../constants";
import { UserPicker } from "../pickers";
import type { TicketFormValues } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function TicketFormFields({
  form,
  translate,
}: {
  form: UseFormReturn<TicketFormValues>;
  translate: Translate;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="subject"
        rules={{
          required: translate(
            "helpdesk.form.fields.subject.required",
            { ns: "starter" },
            "Subject is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("helpdesk.fields.subject", { ns: "starter" }, "Subject")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "helpdesk.form.fields.subject.placeholder",
                    { ns: "starter" },
                    "Short summary of the issue"
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
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("helpdesk.fields.description", { ns: "starter" }, "Description")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "helpdesk.form.fields.description.placeholder",
                    { ns: "starter" },
                    "Describe the problem, steps to reproduce, and impact"
                  )}
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
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("helpdesk.fields.category", { ns: "starter" }, "Category")}
              </FormLabel>
              <FormControl
                render={
                  <NativeSelect
                    {...field}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                  >
                    <NativeSelectOption value="">
                      {translate("helpdesk.form.fields.category.unspecified", { ns: "starter" }, "Unspecified")}
                    </NativeSelectOption>
                    {TICKET_CATEGORIES.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {labelFor(TICKET_CATEGORIES, option.value, translate)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("helpdesk.fields.priority", { ns: "starter" }, "Priority")}
              </FormLabel>
              <FormControl
                render={
                  <NativeSelect
                    {...field}
                    value={field.value ?? "med"}
                    onChange={(event) =>
                      field.onChange(event.target.value || "med")
                    }
                  >
                    {TICKET_PRIORITIES.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {labelFor(TICKET_PRIORITIES, option.value, translate)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("helpdesk.fields.status", { ns: "starter" }, "Status")}
            </FormLabel>
            <FormControl
              render={
                <NativeSelect
                  {...field}
                  value={field.value ?? "open"}
                  onChange={(event) =>
                    field.onChange(event.target.value || "open")
                  }
                >
                  {TICKET_STATUSES.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {labelFor(TICKET_STATUSES, option.value, translate)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="requesterId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("helpdesk.fields.requester", { ns: "starter" }, "Requester")}
              </FormLabel>
              <FormControl
                render={
                  <UserPicker
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    placeholder={translate(
                      "helpdesk.form.fields.requester.placeholder",
                      { ns: "starter" },
                      "Who raised this ticket?"
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
          name="assigneeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("helpdesk.fields.assignee", { ns: "starter" }, "Assignee")}
              </FormLabel>
              <FormControl
                render={
                  <UserPicker
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    placeholder={translate(
                      "helpdesk.form.fields.assignee.placeholder",
                      { ns: "starter" },
                      "Assign an agent"
                    )}
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
