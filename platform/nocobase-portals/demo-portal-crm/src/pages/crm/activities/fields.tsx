import { type useTranslate } from "@refinedev/core";
import { useMemo } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { ACTIVITY_TYPES, labelFor, toDateTimeInputValue } from "../constants";
import { ContactPicker, CustomerPicker } from "../pickers";
import type { ActivityFormValues, ActivityRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function ActivityFormFields({
  form,
  translate,
  presetCustomerId,
  record,
}: {
  form: UseFormReturn<ActivityFormValues>;
  translate: Translate;
  presetCustomerId?: string;
  record?: ActivityRecord | null;
}) {
  const watchedCustomerId = useWatch({
    control: form.control,
    name: "customer_id",
  });

  const customerInitial = useMemo(
    () =>
      record?.customer?.company_name
        ? {
            value: String(record.customer.id),
            label: record.customer.company_name,
          }
        : null,
    [record]
  );
  const contactInitial = useMemo(
    () =>
      record?.contact?.name
        ? { value: String(record.contact.id), label: record.contact.name }
        : null,
    [record]
  );

  return (
    <>
      <FormField
        control={form.control}
        name="subject"
        rules={{
          required: translate(
            "crm.activities.validation.subject",
            { ns: "starter" },
            "Subject is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.activities.fields.subject", { ns: "starter" }, "Subject")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "crm.activities.form.subject.placeholder",
                    { ns: "starter" },
                    "e.g. Showroom visit — measured the 4th floor"
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
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("crm.activities.fields.type", { ns: "starter" }, "Type")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "call"}
                    onValueChange={(value) => field.onChange(value ?? "call")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{labelFor(ACTIVITY_TYPES, field.value ?? "call", translate)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {labelFor(ACTIVITY_TYPES, type.value, translate)}
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
          name="date"
          rules={{
            required: translate(
              "crm.activities.validation.date",
              { ns: "starter" },
              "When did this happen?"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("crm.activities.fields.date", { ns: "starter" }, "Date & time")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={toDateTimeInputValue(field.value)}
                    type="datetime-local"
                    onChange={(event) => field.onChange(event.target.value || null)}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="customer_id"
        rules={{
          required: translate(
            "crm.activities.validation.customer",
            { ns: "starter" },
            "Pick the customer for this activity"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.activities.fields.customer", { ns: "starter" }, "Customer")}
            </FormLabel>
            <FormControl
              render={
                <CustomerPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={Boolean(presetCustomerId)}
                  initialOption={customerInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="contact_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.activities.fields.contact", { ns: "starter" }, "Contact")}
            </FormLabel>
            <FormControl
              render={
                <ContactPicker
                  customerId={watchedCustomerId}
                  value={field.value}
                  onChange={field.onChange}
                  initialOption={contactInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("crm.activities.fields.notes", { ns: "starter" }, "Notes")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "crm.activities.form.notes.placeholder",
                    { ns: "starter" },
                    "What was discussed, next steps..."
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
