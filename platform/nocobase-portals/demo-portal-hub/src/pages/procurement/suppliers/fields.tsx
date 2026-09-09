import type { useTranslate } from "@refinedev/core";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPLIER_STATUSES, labelFor } from "../constants";
import type { SupplierFormValues } from "../types";

export function SupplierFormFields({
  form,
  translate,
}: {
  form: UseFormReturn<SupplierFormValues>;
  translate: ReturnType<typeof useTranslate>;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        rules={{
          required: translate(
            "procurement.suppliers.form.nameRequired",
            { ns: "starter" },
            "Supplier name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("procurement.suppliers.form.name", { ns: "starter" }, "Supplier name")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "procurement.suppliers.form.namePlaceholder",
                    { ns: "starter" },
                    "e.g. Northwind Supply Co."
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
          name="contact_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("procurement.suppliers.form.contactName", { ns: "starter" }, "Contact name")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "procurement.suppliers.form.contactPlaceholder",
                      { ns: "starter" },
                      "e.g. Marcus Reed"
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("procurement.suppliers.form.email", { ns: "starter" }, "Email")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="email"
                    placeholder={translate(
                      "procurement.suppliers.form.emailPlaceholder",
                      { ns: "starter" },
                      "contact@supplier.com"
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
          name="rating"
          rules={{
            min: {
              value: 1,
              message: translate(
                "procurement.suppliers.form.ratingRange",
                { ns: "starter" },
                "Rating is between 1 and 5"
              ),
            },
            max: {
              value: 5,
              message: translate(
                "procurement.suppliers.form.ratingRange",
                { ns: "starter" },
                "Rating is between 1 and 5"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("procurement.suppliers.form.rating", { ns: "starter" }, "Rating (1–5)")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    placeholder="4"
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

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("procurement.suppliers.form.status", { ns: "starter" }, "Status")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "active"}
                    onValueChange={(value) => field.onChange(value ?? "active")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(SUPPLIER_STATUSES, field.value ?? "active", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPLIER_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {labelFor(SUPPLIER_STATUSES, status.value, translate)}
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
    </>
  );
}
