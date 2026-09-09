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
import { DEAL_STAGES, labelFor, toDateInputValue } from "../constants";
import { ContactPicker, CustomerPicker, OwnerPicker } from "../pickers";
import { DrawerSection } from "../shared";
import type { DealFormValues, DealRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function DealFormFields({
  form,
  translate,
  presetCustomerId,
  record,
}: {
  form: UseFormReturn<DealFormValues>;
  translate: Translate;
  presetCustomerId?: string;
  record?: DealRecord | null;
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
  const ownerInitial = useMemo(
    () =>
      record?.owner?.nickname
        ? { value: String(record.owner.id), label: record.owner.nickname }
        : null,
    [record]
  );

  return (
    <>
      <DrawerSection
        title={translate("crm.forms.sections.deal", { ns: "starter" }, "Deal")}
      >
        <FormField
          control={form.control}
          name="title"
          rules={{
            required: translate(
              "crm.deals.validation.title",
              { ns: "starter" },
              "Deal title is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("crm.deals.fields.title", { ns: "starter" }, "Deal")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "crm.deals.form.title.placeholder",
                      { ns: "starter" },
                      "e.g. HQ desks and task chairs"
                    )}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <DrawerSection
          title={translate(
            "crm.forms.sections.relationships",
            { ns: "starter" },
            "Relationships"
          )}
        >
          <FormField
            control={form.control}
            name="customer_id"
            rules={{
              required: translate(
                "crm.deals.validation.customer",
                { ns: "starter" },
                "Pick the customer this deal is for"
              ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.deals.fields.customer",
                    { ns: "starter" },
                    "Customer"
                  )}
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

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {translate(
                      "crm.deals.fields.contact",
                      { ns: "starter" },
                      "Contact"
                    )}
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
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {translate(
                      "crm.deals.fields.owner",
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

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="stage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.deals.fields.stage",
                    { ns: "starter" },
                    "Stage"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Select
                      value={field.value ?? "inquiry"}
                      onValueChange={(value) =>
                        field.onChange(value ?? "inquiry")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {labelFor(
                            DEAL_STAGES,
                            field.value ?? "inquiry",
                            translate
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DEAL_STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {labelFor(DEAL_STAGES, stage.value, translate)}
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
            name="amount"
            rules={{
              required: translate(
                "crm.deals.validation.amount",
                { ns: "starter" },
                "Enter the deal value"
              ),
              min: {
                value: 0,
                message: translate(
                  "crm.deals.validation.amountMin",
                  { ns: "starter" },
                  "Amount cannot be negative"
                ),
              },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.deals.fields.amount",
                    { ns: "starter" },
                    "Amount"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="12000"
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
          "crm.forms.sections.timeline",
          { ns: "starter" },
          "Timeline"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="expected_close_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.deals.fields.expectedClose",
                    { ns: "starter" },
                    "Expected close"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={toDateInputValue(field.value)}
                      type="date"
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

          <FormField
            control={form.control}
            name="closed_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "crm.deals.fields.closedDate",
                    { ns: "starter" },
                    "Closed date"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={toDateInputValue(field.value)}
                      type="date"
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
                  "crm.deals.fields.notes",
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
                      "crm.deals.form.notes.placeholder",
                      { ns: "starter" },
                      "Requirements, budget, decision makers..."
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
