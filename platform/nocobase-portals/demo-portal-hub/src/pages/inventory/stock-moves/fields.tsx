import { type useTranslate } from "@refinedev/core";
import { useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { MOVE_TYPES, labelFor, signedQty, toDateTimeInputValue } from "../constants";
import { useOnHandMatrix } from "../aggregates";
import { ProductPicker, WarehousePicker } from "../pickers";
import type { StockMoveFormValues, StockMoveRecord } from "../types";

type Translate = ReturnType<typeof useTranslate>;

export function StockMoveFormFields({
  form,
  translate,
  presetProductId,
  record,
}: {
  form: UseFormReturn<StockMoveFormValues>;
  translate: Translate;
  presetProductId?: string;
  record?: StockMoveRecord | null;
}) {
  const productInitial = useMemo(
    () =>
      record?.product?.name
        ? {
            value: String(record.product.id),
            label: record.product.sku
              ? `${record.product.name} (${record.product.sku})`
              : record.product.name,
          }
        : null,
    [record]
  );
  const warehouseInitial = useMemo(
    () =>
      record?.warehouse?.name
        ? { value: String(record.warehouse.id), label: record.warehouse.name }
        : null,
    [record]
  );
  const matrix = useOnHandMatrix();
  const productId = form.watch("product_id");
  const warehouseId = form.watch("warehouse_id");
  const moveType = form.watch("type");
  const availableForOutbound = useMemo(() => {
    if (!productId || !warehouseId) return 0;
    const current = matrix.cells.get(`${productId}::${warehouseId}`) ?? 0;
    const editingSameCell =
      record &&
      String(record.product_id ?? record.product?.id ?? "") === String(productId) &&
      String(record.warehouse_id ?? record.warehouse?.id ?? "") ===
        String(warehouseId);
    return editingSameCell
      ? current - signedQty(record.type, record.qty)
      : current;
  }, [matrix.cells, productId, record, warehouseId]);

  return (
    <>
      <FormField
        control={form.control}
        name="product_id"
        rules={{
          required: translate(
            "inventory.stockMoves.validation.product",
            { ns: "starter" },
            "Pick the product this move is for"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("inventory.stockMoves.fields.product", { ns: "starter" }, "Product")}</FormLabel>
            <FormControl
              render={
                <ProductPicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={Boolean(presetProductId)}
                  initialOption={productInitial}
                />
              }
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="warehouse_id"
        rules={{
          required: translate(
            "inventory.stockMoves.validation.warehouse",
            { ns: "starter" },
            "Pick a warehouse"
          ),
        }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("inventory.stockMoves.fields.warehouse", { ns: "starter" }, "Warehouse")}</FormLabel>
            <FormControl
              render={
                <WarehousePicker
                  value={field.value}
                  onChange={field.onChange}
                  initialOption={warehouseInitial}
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
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.stockMoves.fields.type", { ns: "starter" }, "Type")}</FormLabel>
              <FormControl
                render={
                  <Select
                    value={field.value ?? "in"}
                    onValueChange={(value) => field.onChange(value ?? "in")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {labelFor(MOVE_TYPES, field.value ?? "in", translate)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MOVE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {labelFor(MOVE_TYPES, type.value, translate)}
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
          name="qty"
          rules={{
            required: translate(
              "inventory.stockMoves.validation.qty",
              { ns: "starter" },
              "Enter the quantity"
            ),
            validate: {
              positiveInteger: (value) =>
                (typeof value === "number" && Number.isInteger(value) && value > 0) ||
                translate(
                  "inventory.stockMoves.validation.qtyPositiveInteger",
                  { ns: "starter" },
                  "Quantity must be a positive whole number"
                ),
              availableStock: (value) => {
                if (moveType !== "out" || typeof value !== "number") return true;
                if (matrix.isLoading) {
                  return translate(
                    "inventory.stockMoves.validation.stockLoading",
                    { ns: "starter" },
                    "Wait for available stock to finish loading"
                  );
                }
                if (matrix.isError) {
                  return translate(
                    "inventory.stockMoves.validation.stockUnavailable",
                    { ns: "starter" },
                    "Available stock could not be verified; try again"
                  );
                }
                return (
                  availableForOutbound - value >= 0 ||
                  translate(
                    "inventory.stockMoves.validation.insufficientStock",
                    { ns: "starter", available: availableForOutbound },
                    "Only {{available}} units are available in this warehouse"
                  ).replace("{{available}}", String(availableForOutbound))
                );
              },
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate("inventory.stockMoves.fields.quantity", { ns: "starter" }, "Quantity")}</FormLabel>
              <FormControl
                render={
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min="1"
                    step="1"
                    placeholder={translate(
                      "inventory.stockMoves.form.qty.placeholder",
                      { ns: "starter" },
                      "e.g. 24"
                    )}
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

      <FormField
        control={form.control}
        name="moved_at"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("inventory.stockMoves.fields.movedAt", { ns: "starter" }, "Moved at")}</FormLabel>
            <FormControl
              render={
                <Input
                  {...field}
                  value={toDateTimeInputValue(field.value)}
                  type="datetime-local"
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
        name="note"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{translate("inventory.stockMoves.fields.note", { ns: "starter" }, "Note")}</FormLabel>
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder={translate(
                    "inventory.stockMoves.form.note.placeholder",
                    { ns: "starter" },
                    "Reference, reason, PO number..."
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
