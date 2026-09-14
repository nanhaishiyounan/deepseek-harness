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
import { Textarea } from "@/components/ui/textarea";
import { CategoryPicker } from "../pickers";
import type { CategoryFormValues } from "../types";

export function CategoryFormFields({
  form,
}: {
  form: UseFormReturn<CategoryFormValues>;
}) {
  const translate = useTranslate();
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        rules={{
          required: translate(
            "knowledge.categories.fields.name.required",
            { ns: "starter" },
            "Name is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("knowledge.categories.fields.name", { ns: "starter" }, "Name")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "knowledge.categories.fields.name.placeholder",
                    { ns: "starter" },
                    "e.g. Engineering"
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
        name="parent_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("knowledge.categories.fields.parent", { ns: "starter" }, "Parent category")}
            </FormLabel>
            <FormControl
              render={
                <CategoryPicker value={field.value} onChange={field.onChange} />
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
              {translate("knowledge.categories.fields.description", { ns: "starter" }, "Description")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={3}
                  placeholder={translate(
                    "knowledge.categories.fields.description.placeholder",
                    { ns: "starter" },
                    "What belongs in this category?"
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
