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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, PRODUCT_STATUSES, labelFor } from "../constants";
import type { ProductFormValues } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function ProductFormFields({
  form,
  translate,
}: {
  form: UseFormReturn<ProductFormValues>;
  translate: Translate;
}) {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="sku"
          rules={{
            required: translate(
              "inventory.products.validation.sku",
              { ns: "starter" },
              "SKU is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.products.fields.sku", { ns: "starter" }, "SKU")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "inventory.products.form.sku.placeholder",
                      { ns: "starter" },
                      "e.g. EL-1001"
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
          name="name"
          rules={{
            required: translate(
              "inventory.products.validation.name",
              { ns: "starter" },
              "Product name is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.products.fields.name", { ns: "starter" }, "Name")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "inventory.products.form.name.placeholder",
                      { ns: "starter" },
                      'e.g. 27" 4K Monitor'
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
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.products.fields.category", { ns: "starter" }, "Category")}</FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "other"}
                    onValueChange={(value) => field.onChange(value ?? "other")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(CATEGORIES, field.value ?? "other", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {labelFor(CATEGORIES, category.value, translate)}
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
              <FormLabel>{translate("inventory.products.fields.status", { ns: "starter" }, "Status")}</FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "active"}
                    onValueChange={(value) => field.onChange(value ?? "active")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(PRODUCT_STATUSES, field.value ?? "active", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {labelFor(PRODUCT_STATUSES, status.value, translate)}
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
          name="unit_price"
          rules={{
            min: {
              value: 0,
              message: translate(
                "inventory.products.validation.unitPrice",
                { ns: "starter" },
                "Price cannot be negative"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.products.fields.unitPrice", { ns: "starter" }, "Unit price")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
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
          name="reorder_level"
          rules={{
            min: {
              value: 0,
              message: translate(
                "inventory.products.validation.reorderLevel",
                { ns: "starter" },
                "Reorder level cannot be negative"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.products.fields.reorderLevel", { ns: "starter" }, "Reorder level")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step="1"
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
    </>
  );
}
