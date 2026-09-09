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
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  MANUAL_LEAD_STATUSES,
  labelFor,
} from "../constants";
import { OwnerPicker } from "../pickers";
import type { LeadFormValues, LeadRecord } from "../types";

export function LeadFormFields({
  form,
  record,
}: {
  form: UseFormReturn<LeadFormValues>;
  record?: LeadRecord | null;
}) {
  const translate = useTranslate();
  const ownerInitial = useMemo(
    () =>
      record?.owner
        ? {
            value: String(record.owner.id),
            label:
              record.owner.nickname ||
              record.owner.username ||
              `User #${record.owner.id}`,
          }
        : null,
    [record]
  );

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="name"
          rules={{
            required: translate(
              "sales.leads.validation.name",
              { ns: "starter" },
              "Lead name is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("sales.leads.fields.name", { ns: "starter" }, "Name")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "sales.leads.placeholder.name",
                      { ns: "starter" },
                      "e.g. Laura Mitchell"
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
                  "sales.leads.fields.company",
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
                      "sales.leads.placeholder.company",
                      { ns: "starter" },
                      "e.g. Vertex Logistics"
                    )}
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
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("sales.leads.fields.email", { ns: "starter" }, "Email")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="email"
                  placeholder="name@company.com"
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
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("sales.leads.fields.source", { ns: "starter" }, "Source")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(value) => field.onChange(value || null)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={translate(
                          "sales.leads.placeholder.source",
                          { ns: "starter" },
                          "Select source"
                        )}
                      >
                        {field.value
                          ? labelFor(LEAD_SOURCES, field.value, translate)
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((source) => (
                        <SelectItem key={source.value} value={source.value}>
                          {labelFor(LEAD_SOURCES, source.value, translate)}
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
                {translate("sales.leads.fields.status", { ns: "starter" }, "Status")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "new"}
                    onValueChange={(value) => field.onChange(value ?? "new")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(LEAD_STATUSES, field.value ?? "new", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_LEAD_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {labelFor(MANUAL_LEAD_STATUSES, status.value, translate)}
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
              {translate("sales.leads.fields.owner", { ns: "starter" }, "Owner")}
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
    </>
  );
}
