import { useList, useTranslate } from "@refinedev/core";
import { useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES, labelFor } from "../constants";
import type { AssetRecord, MaintenanceFormValues } from "../types";

export function MaintenanceFormFields({
  form,
  lockAsset = false,
}: {
  form: UseFormReturn<MaintenanceFormValues>;
  lockAsset?: boolean;
}) {
  const translate = useTranslate();
  // The asset picker offers every device; a repair can be logged against any
  // asset regardless of its assignment status.
  const { result: assets } = useList<AssetRecord>({
    resource: "hub_as_assets",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "tag", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false, enabled: !lockAsset },
  });

  const assetOptions = useMemo(
    () =>
      assets.data.map((asset) => ({
        value: String(asset.id),
        label: `${asset.tag ?? ""} · ${asset.name ?? ""}`.replace(/^ · /, ""),
      })),
    [assets.data]
  );

  return (
    <>
      <FormField
        control={form.control}
        name="title"
        rules={{
          required: translate(
            "assets.maintenance.form.titleRequired",
            { ns: "starter" },
            "A title is required"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("assets.maintenance.fields.title", { ns: "starter" }, "Title")}
            </FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "assets.maintenance.fields.titlePlaceholder",
                    { ns: "starter" },
                    "e.g. Battery replacement"
                  )}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      {!lockAsset ? (
        <FormField
          control={form.control}
          name="assetId"
          rules={{
            required: translate(
              "assets.maintenance.form.assetRequired",
              { ns: "starter" },
              "Pick the asset being serviced"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.asset", { ns: "starter" }, "Asset")}
              </FormLabel>
              <FormControl
                render={
                  <NativeSelect
                    {...field}
                    value={field.value == null ? "" : String(field.value)}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                  >
                    <NativeSelectOption value="">
                      {translate(
                        "assets.maintenance.fields.assetPlaceholder",
                        { ns: "starter" },
                        "Select an asset"
                      )}
                    </NativeSelectOption>
                    {assetOptions.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="type"
          rules={{
            required: translate(
              "assets.maintenance.form.typeRequired",
              { ns: "starter" },
              "Pick a maintenance type"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.type", { ns: "starter" }, "Type")}
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
                        "assets.maintenance.fields.typePlaceholder",
                        { ns: "starter" },
                        "Select a type"
                      )}
                    </NativeSelectOption>
                    {MAINTENANCE_TYPES.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {labelFor(MAINTENANCE_TYPES, option.value, translate)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          rules={{
            required: translate(
              "assets.maintenance.form.statusRequired",
              { ns: "starter" },
              "Pick a status"
            ),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.status", { ns: "starter" }, "Status")}
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
                        "assets.maintenance.fields.statusPlaceholder",
                        { ns: "starter" },
                        "Select a status"
                      )}
                    </NativeSelectOption>
                    {MAINTENANCE_STATUSES.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {labelFor(MAINTENANCE_STATUSES, option.value, translate)}
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
          name="scheduled_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.scheduledDate", { ns: "starter" }, "Scheduled date")}
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
          name="completed_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.completedDate", { ns: "starter" }, "Completed date")}
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
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="cost"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.cost", { ns: "starter" }, "Cost")}
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
                    min="0"
                    step="0.01"
                    placeholder="0"
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="vendor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {translate("assets.maintenance.fields.vendor", { ns: "starter" }, "Vendor")}
              </FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={translate(
                      "assets.maintenance.fields.vendorPlaceholder",
                      { ns: "starter" },
                      "Who is doing the work"
                    )}
                  />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {translate("assets.maintenance.fields.notes", { ns: "starter" }, "Notes")}
            </FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "assets.maintenance.fields.notesPlaceholder",
                    { ns: "starter" },
                    "Anything worth recording about this work"
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
