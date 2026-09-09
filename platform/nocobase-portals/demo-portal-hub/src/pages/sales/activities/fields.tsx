import type { UseFormReturn } from "react-hook-form";
import { useMemo } from "react";
import { useTranslate } from "@refinedev/core";
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
import { ACTIVITY_TYPES, labelFor } from "../constants";
import { DealPicker } from "../pickers";
import type { ActivityFormValues, ActivityRecord } from "../types";

const toDateTimeInputValue = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate()
  )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export function ActivityFormFields({
  form,
  presetDealId,
  record,
}: {
  form: UseFormReturn<ActivityFormValues>;
  presetDealId?: string;
  record?: ActivityRecord | null;
}) {
  const translate = useTranslate();
  const dealInitial = useMemo(
    () =>
      record?.deal?.title
        ? { value: String(record.deal.id), label: record.deal.title }
        : null,
    [record]
  );

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "sales.activities.fields.type",
                  { ns: "starter" },
                  "Type"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "call"}
                    onValueChange={(value) => field.onChange(value ?? "call")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(ACTIVITY_TYPES, field.value ?? "call", translate)}
                      </SelectValue>
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
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "sales.activities.fields.date",
                  { ns: "starter" },
                  "Date"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={toDateTimeInputValue(field.value)}
                    type="datetime-local"
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
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
        name="subject"
        rules={{
          required: translate(
            "sales.activities.validation.subject",
            { ns: "starter" },
            "Subject is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate(
                "sales.activities.fields.subject",
                { ns: "starter" },
                "Subject"
              )}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "sales.activities.placeholder.subject",
                    { ns: "starter" },
                    "e.g. Discovery call"
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
        name="deal_id"
        rules={{
          required: translate(
            "sales.activities.validation.deal",
            { ns: "starter" },
            "Link this activity to a deal"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate(
                "sales.activities.fields.deal",
                { ns: "starter" },
                "Deal"
              )}
            </FormLabel>
            <FormControl
              render={
                <DealPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={Boolean(presetDealId)}
                  initialOption={dealInitial}
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
              {translate(
                "sales.activities.fields.notes",
                { ns: "starter" },
                "Notes"
              )}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "sales.activities.placeholder.notes",
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
