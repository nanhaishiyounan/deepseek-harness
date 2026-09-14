import { useTranslate } from "@refinedev/core";
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
import { ASSET_CATEGORIES, labelFor } from "../constants";
import type { AssetFormValues } from "../types";

export function AssetFormFields({
  form,
}: {
  form: UseFormReturn<AssetFormValues>;
}) {
  const translate = useTranslate();
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="tag"
          rules={{
            required: translate(
              "assets.assets.form.tagRequired",
              { ns: "starter" },
              "Asset tag is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.assets.fields.tag", { ns: "starter" }, "Asset tag")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "assets.assets.form.tagPlaceholder",
                      { ns: "starter" },
                      "e.g. AS-1024"
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
              "assets.assets.form.nameRequired",
              { ns: "starter" },
              "Name is required"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.assets.fields.name", { ns: "starter" }, "Name")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "assets.assets.form.namePlaceholder",
                      { ns: "starter" },
                      'e.g. MacBook Pro 16"'
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
              <FormLabel>
                {translate("assets.assets.fields.category", { ns: "starter" }, "Category")}
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
                        "assets.assets.form.categoryUnspecified",
                        { ns: "starter" },
                        "Unspecified"
                      )}
                    </NativeSelectOption>
                    {ASSET_CATEGORIES.map((category) => (
                      <NativeSelectOption key={category.value} value={category.value}>
                        {labelFor(ASSET_CATEGORIES, category.value, translate)}
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

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="purchase_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.assets.fields.purchaseDate", { ns: "starter" }, "Purchase date")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                    type="date"
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.assets.fields.value", { ns: "starter" }, "Value (USD)")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : Number(event.target.value)
                      )
                    }
                    type="number"
                    min={0}
                    step="1"
                    placeholder="0"
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
