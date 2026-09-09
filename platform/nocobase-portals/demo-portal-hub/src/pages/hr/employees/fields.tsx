import { useList, useTranslate } from "@refinedev/core";
import { AlertTriangle } from "lucide-react";
import type { PropsWithChildren } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Separator } from "@/components/ui/separator";
import { EMPLOYEE_STATUSES, labelFor, toDateInputValue } from "../constants";
import { DepartmentPicker, EmployeePicker } from "../pickers";
import type { EmployeeFormValues, EmployeeRecord } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function todayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function FormSection({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function EmployeeFormFields({
  form,
  employeeId,
}: {
  form: UseFormReturn<EmployeeFormValues>;
  employeeId?: string;
}) {
  const translate = useTranslate();
  const email = (form.watch("email") ?? "").trim();
  const name = (form.watch("name") ?? "").trim();
  const validEmail = EMAIL_PATTERN.test(email);
  const emailMatches = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 10 },
    filters: [{ field: "email", operator: "eq", value: email }],
    errorNotification: false,
    queryOptions: { enabled: validEmail, retry: false },
  });
  const nameMatches = useList<EmployeeRecord>({
    resource: "hub_hr_employees",
    pagination: { mode: "server", currentPage: 1, pageSize: 10 },
    filters: [{ field: "name", operator: "eq", value: name }],
    errorNotification: false,
    queryOptions: { enabled: Boolean(name), retry: false },
  });
  const duplicateEmail = (emailMatches.result.data ?? []).find(
    (row) => String(row.id) !== String(employeeId ?? "")
  );
  const duplicateName = (nameMatches.result.data ?? []).find(
    (row) => String(row.id) !== String(employeeId ?? "")
  );

  return (
    <>
      <FormSection
        title={translate("hr.employees.form.sections.identity", { ns: "starter" }, "Identity")}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            rules={{
              required: translate(
                "hr.employees.form.nameRequired",
                { ns: "starter" },
                "Full name is required"
              ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.employees.fields.fullName", { ns: "starter" }, "Full name")}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder={translate(
                        "hr.employees.form.namePlaceholder",
                        { ns: "starter" },
                        "e.g. Grace Okafor"
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
            rules={{
              pattern: {
                value: EMAIL_PATTERN,
                message: translate(
                  "hr.employees.form.emailInvalid",
                  { ns: "starter" },
                  "Enter a valid email address"
                ),
              },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.employees.fields.email", { ns: "starter" }, "Email")}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                      placeholder={translate(
                        "hr.employees.form.emailPlaceholder",
                        { ns: "starter" },
                        "name@company.com"
                      )}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {duplicateEmail || duplicateName ? (
          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400">
            <AlertTriangle />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              {duplicateEmail ? (
                <p>
                  {translate(
                    "hr.employees.form.duplicateEmail",
                    { ns: "starter", name: duplicateEmail.name ?? email },
                    "Someone already uses this email: {{name}}"
                  )}
                </p>
              ) : null}
              {duplicateName ? (
                <p>
                  {translate(
                    "hr.employees.form.duplicateName",
                    { ns: "starter", name: duplicateName.name ?? name },
                    "Someone already has this exact name: {{name}}"
                  )}
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </FormSection>

      <Separator />

      <FormSection
        title={translate("hr.employees.form.sections.role", { ns: "starter" }, "Role")}
      >
        <FormField
          control={form.control}
          name="job_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("hr.employees.fields.title", { ns: "starter" }, "Title")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "hr.employees.form.titlePlaceholder",
                      { ns: "starter" },
                      "e.g. Backend Engineer"
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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.employees.fields.status", { ns: "starter" }, "Status")}
                </FormLabel>
                <FormControl
                  render={
                    <Select
                      value={field.value ?? "active"}
                      onValueChange={(value) => field.onChange(value ?? "active")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={translate(
                            "hr.employees.form.statusPlaceholder",
                            { ns: "starter" },
                            "Select status"
                          )}
                        >
                          {labelFor(EMPLOYEE_STATUSES, field.value ?? "active", translate)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYEE_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {labelFor(EMPLOYEE_STATUSES, status.value, translate)}
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
            name="hire_date"
            rules={{
              validate: (value) =>
                !value ||
                value.slice(0, 10) <= todayInputValue() ||
                translate(
                  "hr.employees.form.hireDateFuture",
                  { ns: "starter" },
                  "Hire date cannot be in the future"
                ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.employees.fields.hireDate", { ns: "starter" }, "Hire date")}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      type="date"
                      value={toDateInputValue(field.value)}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormSection>

      <Separator />

      <FormSection
        title={translate(
          "hr.employees.form.sections.reporting",
          { ns: "starter" },
          "Reporting line"
        )}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="department_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate(
                    "hr.employees.fields.department",
                    { ns: "starter" },
                    "Department"
                  )}
                </FormLabel>
                <FormControl
                  render={
                    <DepartmentPicker value={field.value} onChange={field.onChange} />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manager_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.employees.fields.manager", { ns: "starter" }, "Manager")}
                </FormLabel>
                <FormControl
                  render={
                    <EmployeePicker
                      value={field.value}
                      onChange={field.onChange}
                      excludeId={employeeId}
                      placeholder={translate(
                        "hr.employees.form.managerPlaceholder",
                        { ns: "starter" },
                        "Reports to..."
                      )}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormSection>
    </>
  );
}
