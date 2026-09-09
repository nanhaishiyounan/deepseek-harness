import { type HttpError, useList, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";

import { AiFillPanel, useAiFill, type AiFillField } from "@/components/ai-fill";
import { Button } from "@/components/ui/button";
import {
  Form,
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
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  optionLabel,
  type Option,
} from "../constants";
import { useContextualCloseTo } from "../route-surfaces";
import type { Expense, ExpenseFormValues, UserRef } from "../types";

const DEFAULTS: ExpenseFormValues = {
  title: "",
  category: "travel",
  amount: "",
  spent_at: "",
  status: "pending",
  employee_id: "",
};

export function ExpenseCreate() {
  const t = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={t("finance.expenses.drawer.create.title", "New expense")}
        description={t(
          "finance.expenses.drawer.create.desc",
          "Log an employee expense claim for review."
        )}
        closeLabel={t("finance.common.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <ExpenseForm mode="create" />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

export function ExpenseEdit() {
  const t = useTranslate();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={t("finance.expenses.drawer.edit.title", "Edit expense")}
        description={t(
          "finance.expenses.drawer.edit.desc",
          "Update the claim details or status."
        )}
        closeLabel={t("finance.common.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <ExpenseForm mode="edit" />
      </RouteDrawer>
      {confirmation}
    </>
  );
}

function ExpenseForm({ mode }: { mode: "create" | "edit" }) {
  const t = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<Expense, HttpError, ExpenseFormValues>({
    refineCoreProps: {
      resource: "hub_fin_expenses",
      action: mode,
      redirect: false,
      meta: { appends: ["employee"] },
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
    defaultValues: DEFAULTS,
  });

  const { result: usersResult } = useList<UserRef>({
    resource: "users",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const users = usersResult?.data ?? [];

  // Allowed values are the same option lists the Select inputs below render.
  const aiFields = useMemo<AiFillField[]>(
    () => [
      {
        name: "title",
        title: t("finance.expenses.field.description", "Description"),
        type: "string",
        description: "A short description of what was paid for.",
      },
      {
        name: "category",
        title: t("finance.expenses.field.category", "Category"),
        type: "string",
        enum: [...EXPENSE_CATEGORIES],
      },
      {
        name: "amount",
        title: t("finance.expenses.field.amount", "Amount (USD)"),
        type: "number",
        description:
          "Amount in USD as a plain number, with no currency symbol or thousands separator.",
      },
      {
        name: "spent_at",
        title: t("finance.expenses.field.spentAt", "Spent at"),
        type: "date",
        description:
          "The date the money was spent, as YYYY-MM-DD. Only when the text states a date.",
      },
      {
        name: "status",
        title: t("finance.expenses.field.status", "Status"),
        type: "string",
        enum: [...EXPENSE_STATUSES],
      },
    ],
    [t]
  );

  const ai = useAiFill({
    formId: "hub-expense-create",
    title: t("finance.expenses.drawer.create.title", "New expense"),
    fields: aiFields,
    getValues: () => form.getValues() as Record<string, unknown>,
    setValues: (values) => {
      for (const [name, value] of Object.entries(values)) {
        // The form stores amount as a string and converts on submit.
        const next = typeof value === "number" ? String(value) : value;
        form.setValue(name as keyof ExpenseFormValues, next as never, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    instructions:
      "A newly submitted claim is pending. Only use approved, rejected or reimbursed " +
      "when the text says the claim has already been through review.",
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          onFinish({
            ...values,
            amount: Number(values.amount) || 0,
            employee_id: values.employee_id ? Number(values.employee_id) : null,
          })
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10">
          {mode === "create" ? (
            <AiFillPanel
              ai={ai}
              description={t(
                "finance.expenses.aiFill.desc",
                "Describe the expense in plain language. AI assist will structure the claim for you."
              )}
              inputLabel={t("finance.expenses.aiFill.label", "Describe the expense")}
              placeholder={t(
                "finance.expenses.aiFill.placeholder",
                "Example: Return flight to the Berlin client kickoff on 12 May 2026, 842.50 USD on my company card."
              )}
            />
          ) : null}
          <TextField
            form={form}
            name="title"
            label={t("finance.expenses.field.description", "Description")}
            required
            placeholder={t("finance.expenses.placeholder.description", "Flight to client kickoff")}
          />
          <div className="grid grid-cols-2 gap-4">
            <OptionSelect
              form={form}
              name="category"
              label={t("finance.expenses.field.category", "Category")}
              options={EXPENSE_CATEGORIES}
            />
            <TextField
              form={form}
              name="amount"
              label={t("finance.expenses.field.amount", "Amount (USD)")}
              type="number"
              required
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              form={form}
              name="spent_at"
              label={t("finance.expenses.field.spentAt", "Spent at")}
              type="date"
            />
            <OptionSelect
              form={form}
              name="status"
              label={t("finance.expenses.field.status", "Status")}
              options={EXPENSE_STATUSES}
            />
          </div>
          <FormField
            control={form.control}
            name="employee_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("finance.expenses.field.employee", "Employee")}</FormLabel>
                <Select
                  value={field.value ? String(field.value) : ""}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("finance.expenses.field.employeePlaceholder", "Select an employee")} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={String(user.id)}>
                        {user.nickname || user.username || user.email || `User ${user.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {t("finance.common.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? t("finance.common.saving", "Saving…")
              : mode === "create"
                ? t("finance.expenses.form.create", "Create expense")
                : t("finance.common.save", "Save changes")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

function TextField({
  form,
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  form: UseFormReturn<ExpenseFormValues>;
  name: keyof ExpenseFormValues;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const t = useTranslate();
  return (
    <FormField
      control={form.control}
      name={name}
      rules={
        required
          ? {
              required: t(
                "finance.common.fieldRequired",
                { ns: "starter", field: label },
                `${label} is required`
              ),
            }
          : undefined
      }
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl
            render={
              <Input
                {...field}
                value={field.value ?? ""}
                type={type}
                placeholder={placeholder}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OptionSelect({
  form,
  name,
  label,
  options,
}: {
  form: UseFormReturn<ExpenseFormValues>;
  name: keyof ExpenseFormValues;
  label: string;
  options: Option[];
}) {
  const t = useTranslate();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t(
                  "finance.common.selectField",
                  { ns: "starter", field: label.toLowerCase() },
                  `Select ${label.toLowerCase()}`
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {optionLabel(option, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
