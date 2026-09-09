import { type useTranslate } from "@refinedev/core";
import { type UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { WarehouseFormValues } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function WarehouseFormFields({
  form,
  translate,
}: {
  form: UseFormReturn<WarehouseFormValues>;
  translate: Translate;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        rules={{
          required: translate(
            "inventory.warehouses.validation.name",
            { ns: "starter" },
            "Warehouse name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("inventory.warehouses.fields.name", { ns: "starter" }, "Name")}</FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "inventory.warehouses.form.name.placeholder",
                    { ns: "starter" },
                    "e.g. Central Distribution Center"
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
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.warehouses.fields.code", { ns: "starter" }, "Code")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "inventory.warehouses.form.code.placeholder",
                      { ns: "starter" },
                      "e.g. CDC-01"
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
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.warehouses.fields.location", { ns: "starter" }, "Location")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "inventory.warehouses.form.location.placeholder",
                      { ns: "starter" },
                      "e.g. Columbus, OH"
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
