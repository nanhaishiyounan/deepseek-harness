import type { UseFormReturn } from "react-hook-form";
import { useMemo } from "react";
import { useTranslate } from "@refinedev/core";
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
import { DEAL_STAGES, labelFor, toDateInputValue } from "../constants";
import { AccountPicker, OwnerPicker } from "../pickers";
import type { DealFormValues, DealRecord } from "../types";

export function DealFormFields({
  form,
  presetAccountId,
  record,
}: {
  form: UseFormReturn<DealFormValues>;
  presetAccountId?: string;
  record?: DealRecord | null;
}) {
  const translate = useTranslate();
  const accountInitial = useMemo(
    () =>
      record?.account?.name
        ? { value: String(record.account.id), label: record.account.name }
        : null,
    [record]
  );
  const ownerInitial = useMemo(
    () =>
      record?.owner
        ? {
            value: String(record.owner.id),
            label:
              record.owner.nickname ||
              record.owner.username ||
              `User #${record.owner.id}`,
          }
        : null,
    [record]
  );

  return (
    <>
      <FormField
        control={form.control}
        name="title"
        rules={{
          required: translate(
            "sales.deals.validation.title",
            { ns: "starter" },
            "Deal title is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("sales.deals.fields.title", { ns: "starter" }, "Deal")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "sales.deals.placeholder.title",
                    { ns: "starter" },
                    "e.g. ERP add-on rollout"
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
        name="account_id"
        rules={{
          required: translate(
            "sales.deals.validation.account",
            { ns: "starter" },
            "Pick the account this deal is for"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("sales.deals.fields.account", { ns: "starter" }, "Account")}
            </FormLabel>
            <FormControl
              render={
                <AccountPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={Boolean(presetAccountId)}
                  initialOption={accountInitial}
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
          name="stage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("sales.deals.fields.stage", { ns: "starter" }, "Stage")}
              </FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "inquiry"}
                    onValueChange={(value) => field.onChange(value ?? "inquiry")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(DEAL_STAGES, field.value ?? "inquiry", translate)}
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
              "sales.deals.validation.amount",
              { ns: "starter" },
              "Enter the deal value"
            ),
            min: {
              value: 0,
              message: translate(
                "sales.deals.validation.amountMin",
                { ns: "starter" },
                "Amount cannot be negative"
              ),
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("sales.deals.fields.amount", { ns: "starter" }, "Amount")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="88000"
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

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="expected_close_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate(
                  "sales.deals.fields.expectedClose",
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
          name="owner_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("sales.deals.fields.owner", { ns: "starter" }, "Owner")}
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
    </>
  );
}
