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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ARTICLE_STATUSES, labelFor } from "../constants";
import { AuthorPicker, CategoryPicker } from "../pickers";
import type { ArticleFormValues } from "../types";

export function ArticleFormFields({
  form,
  presetCategoryId,
}: {
  form: UseFormReturn<ArticleFormValues>;
  presetCategoryId?: string;
}) {
  const translate = useTranslate();
  return (
    <>
      <FormField
        control={form.control}
        name="title"
        rules={{
          required: translate(
            "knowledge.articles.fields.title.required",
            { ns: "starter" },
            "Title is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("knowledge.articles.fields.title", { ns: "starter" }, "Title")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "knowledge.articles.fields.title.placeholder",
                    { ns: "starter" },
                    "e.g. Incident response runbook"
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
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("knowledge.articles.fields.category", { ns: "starter" }, "Category")}
              </FormLabel>
              <FormControl
                render={
                  <CategoryPicker
                    value={field.value}
                    onChange={field.onChange}
                    disabled={Boolean(presetCategoryId)}
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
                {translate("knowledge.articles.fields.status", { ns: "starter" }, "Status")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "draft"}
                    onValueChange={(value) => field.onChange(value ?? "draft")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={translate(
                          "knowledge.articles.fields.status.placeholder",
                          { ns: "starter" },
                          "Select status"
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {ARTICLE_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {labelFor(ARTICLE_STATUSES, status.value, translate)}
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
        name="author_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("knowledge.articles.fields.author", { ns: "starter" }, "Author")}
            </FormLabel>
            <FormControl
              render={
                <AuthorPicker value={field.value} onChange={field.onChange} />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="summary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("knowledge.articles.fields.summary", { ns: "starter" }, "Summary")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={2}
                  placeholder={translate(
                    "knowledge.articles.fields.summary.placeholder",
                    { ns: "starter" },
                    "A one-line teaser shown on the article card."
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
        name="body"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("knowledge.articles.fields.body", { ns: "starter" }, "Body")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={12}
                  placeholder={translate(
                    "knowledge.articles.fields.body.placeholder",
                    { ns: "starter" },
                    "Write the article. Separate paragraphs with a blank line."
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
