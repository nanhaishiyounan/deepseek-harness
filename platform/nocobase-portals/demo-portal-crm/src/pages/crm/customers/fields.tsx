import { type useTranslate } from "@refinedev/core";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_STATUSES, INDUSTRIES, labelFor } from "../constants";
import { OwnerPicker } from "../pickers";
import { DuplicateCustomerWarning } from "../quick-create";
import { DrawerSection } from "../shared";
import type { CustomerFormValues, CustomerRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function CustomerFormFields({
  form,
  translate,
  record,
}: {
  form: UseFormReturn<CustomerFormValues>;
  translate: Translate;
  record?: CustomerRecord | null;
}) {
  const ownerInitial = record?.owner?.nickname
    ? { value: String(record.owner.id), label: record.owner.nickname }
    : null;
  const watchedName = useWatch({ control: form.control, name: "company_name" });

  return (
    <>
      <DrawerSection
        title={translate(
          "crm.forms.sections.company",
          { ns: "starter" },
          "Company"
        )}
      >
        <FormField
          control={form.control}
          name="company_name"
          rules={{
            required: translate(
              "crm.customers.validation.companyName",
              { ns: "starter" },
              "Company name is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "crm.customers.fields.companyName",
                  { ns: "starter" },
                  "Company name"
                )}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "crm.customers.form.companyName.placeholder",
                      { ns: "starter" },
                      "e.g. Studio North Interiors"
                    )}
                  />
                }
              />
              <FormMessage />
              <DuplicateCustomerWarning
                name={watchedName ?? ""}
                currentId={record?.id}
                translate={translate}
              />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.customers.fields.industry",
                    { ns: "starter" },
                    "Industry"
                  )}
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
                        {translate(
                          "crm.common.unspecified",
                          { ns: "starter" },
                          "Unspecified"
                        )}
                      </NativeSelectOption>
                      {INDUSTRIES.map((industry) => (
                        <NativeSelectOption
                          key={industry.value}
                          value={industry.value}
                        >
                          {labelFor(INDUSTRIES, industry.value, translate)}
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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.customers.fields.status",
                    { ns: "starter" },
                    "Status"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Select
                      value={field.value ?? "active"}
                      onValueChange={(value) =>
                        field.onChange(value ?? "active")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={translate(
                            "crm.customers.form.status.placeholder",
                            { ns: "starter" },
                            "Select status"
                          )}
                        >
                          {labelFor(
                            CUSTOMER_STATUSES,
                            field.value ?? "active",
                            translate
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {labelFor(
                              CUSTOMER_STATUSES,
                              status.value,
                              translate
                            )}
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
      </DrawerSection>

      <DrawerSection
        title={translate(
          "crm.forms.sections.contactDetails",
          { ns: "starter" },
          "Contact details"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.customers.fields.phone",
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

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.customers.fields.website",
                    { ns: "starter" },
                    "Website"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="url"
                      placeholder="https://example.com"
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
        <FormField
          control={form.control}
          name="ownerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "crm.customers.fields.owner",
                  { ns: "starter" },
                  "Account owner"
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
      </DrawerSection>

      <DrawerSection
        title={translate(
          "crm.forms.sections.notes",
          { ns: "starter" },
          "Notes"
        )}
      >
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "crm.customers.fields.notes",
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
                      "crm.customers.form.notes.placeholder",
                      { ns: "starter" },
                      "Anything worth remembering about this account"
                    )}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </DrawerSection>
    </>
  );
}
