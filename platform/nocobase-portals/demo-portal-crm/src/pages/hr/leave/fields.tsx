import { useList, useTranslate } from "@refinedev/core";
import { AlertTriangle } from "lucide-react";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { UseFormReturn } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { LEAVE_STATUSES, LEAVE_TYPES, labelFor, toDateInputValue } from "../constants";
import { EmployeePicker } from "../pickers";
import type { LeaveRequestFormValues, LeaveRequestRecord } from "../types";

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

function businessDaysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export function LeaveFormFields({
  form,
  leaveId,
}: {
  form: UseFormReturn<LeaveRequestFormValues>;
  leaveId?: string;
}) {
  const translate = useTranslate();
  const employeeId = form.watch("employee_id");
  const startDate = form.watch("start_date");
  const endDate = form.watch("end_date");
  const manualDays = useRef(false);
  const initializedRange = useRef(false);
  const [daysManuallySet, setDaysManuallySet] = useState(false);

  const recalculateDays = useCallback(() => {
    if (!startDate || !endDate) return;
    const days = businessDaysBetween(startDate, endDate);
    if (days !== null) form.setValue("days", days, { shouldDirty: true });
  }, [endDate, form, startDate]);

  useEffect(() => {
    if (!startDate || !endDate || businessDaysBetween(startDate, endDate) === null) return;

    if (!initializedRange.current) {
      initializedRange.current = true;
      if (form.getValues("days") !== null) return;
    }
    if (!manualDays.current) recalculateDays();
  }, [endDate, form, recalculateDays, startDate]);

  const { result } = useList<LeaveRequestRecord>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    filters: [{ field: "employee_id", operator: "eq", value: employeeId }],
    errorNotification: false,
    queryOptions: {
      enabled: Boolean(employeeId && startDate && endDate),
      retry: false,
    },
  });
  const overlaps =
    startDate && endDate
      ? (result.data ?? []).filter(
          (row) =>
            String(row.id) !== String(leaveId ?? "") &&
            Boolean(row.start_date && row.end_date) &&
            String(row.start_date).slice(0, 10) <= endDate.slice(0, 10) &&
            String(row.end_date).slice(0, 10) >= startDate.slice(0, 10)
        )
      : [];

  return (
    <>
      <FormSection
        title={translate("hr.leave.form.sections.request", { ns: "starter" }, "Request")}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="employee_id"
            rules={{
              required: translate(
                "hr.leave.form.employeeRequired",
                { ns: "starter" },
                "Pick the employee taking leave"
              ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.leave.fields.employee", { ns: "starter" }, "Employee")}
                </FormLabel>
                <FormControl
                  render={<EmployeePicker value={field.value} onChange={field.onChange} />}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.leave.fields.type", { ns: "starter" }, "Type")}
                </FormLabel>
                <FormControl
                  render={
                    <Select
                      value={field.value ?? "annual"}
                      onValueChange={(value) => field.onChange(value ?? "annual")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={translate(
                            "hr.leave.form.typePlaceholder",
                            { ns: "starter" },
                            "Select type"
                          )}
                        >
                          {labelFor(LEAVE_TYPES, field.value ?? "annual", translate)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {LEAVE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {labelFor(LEAVE_TYPES, type.value, translate)}
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
      </FormSection>

      <Separator />

      <FormSection
        title={translate("hr.leave.form.sections.dates", { ns: "starter" }, "Dates")}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="start_date"
            rules={{
              required: translate(
                "hr.leave.form.startDateRequired",
                { ns: "starter" },
                "Start date is required"
              ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.leave.fields.startDate", { ns: "starter" }, "Start date")}
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
          <FormField
            control={form.control}
            name="end_date"
            rules={{
              required: translate(
                "hr.leave.form.endDateRequired",
                { ns: "starter" },
                "End date is required"
              ),
              validate: (value) =>
                !value ||
                !startDate ||
                value.slice(0, 10) >= startDate.slice(0, 10) ||
                translate(
                  "hr.leave.form.endDateBeforeStart",
                  { ns: "starter" },
                  "End date cannot be before start date"
                ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.leave.fields.endDate", { ns: "starter" }, "End date")}
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
          <FormField
            control={form.control}
            name="days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("hr.leave.fields.days", { ns: "starter" }, "Days")}
                </FormLabel>
                <FormControl
                  render={
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={field.value ?? ""}
                      onChange={(event) => {
                        manualDays.current = true;
                        setDaysManuallySet(true);
                        field.onChange(
                          event.target.value === "" ? null : Number(event.target.value)
                        );
                      }}
                    />
                  }
                />
                <div className="flex min-h-6 items-center gap-1 text-xs text-muted-foreground">
                  <span>
                    {daysManuallySet
                      ? translate(
                          "hr.leave.form.daysManual",
                          { ns: "starter" },
                          "Manually set"
                        )
                      : translate(
                          "hr.leave.form.daysAuto",
                          { ns: "starter" },
                          "Auto-calculated from the dates, weekends excluded"
                        )}
                  </span>
                  {daysManuallySet ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        manualDays.current = false;
                        setDaysManuallySet(false);
                        recalculateDays();
                      }}
                    >
                      {translate(
                        "hr.leave.form.recalculate",
                        { ns: "starter" },
                        "Recalculate"
                      )}
                    </Button>
                  ) : null}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {overlaps.length > 0 ? (
          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400">
            <AlertTriangle />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              <p>
                {translate(
                  "hr.leave.form.overlapWarning",
                  { ns: "starter", count: overlaps.length },
                  "This overlaps {{count}} existing request(s) for this person"
                )}
              </p>
              <ul className="list-disc pl-4">
                {overlaps.map((row) => (
                  <li key={row.id}>
                    {toDateInputValue(row.start_date)} – {toDateInputValue(row.end_date)}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </FormSection>

      <Separator />

      <FormSection
        title={translate("hr.leave.form.sections.details", { ns: "starter" }, "Details")}
      >
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("hr.leave.fields.reason", { ns: "starter" }, "Reason")}
              </FormLabel>
              <FormControl
                render={
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "hr.leave.form.reasonPlaceholder",
                      { ns: "starter" },
                      "Context for the approver"
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
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("hr.leave.fields.status", { ns: "starter" }, "Status")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "pending"}
                    onValueChange={(value) => field.onChange(value ?? "pending")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={translate(
                          "hr.leave.form.statusPlaceholder",
                          { ns: "starter" },
                          "Select status"
                        )}
                      >
                        {labelFor(LEAVE_STATUSES, field.value ?? "pending", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAVE_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {labelFor(LEAVE_STATUSES, status.value, translate)}
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
      </FormSection>
    </>
  );
}
