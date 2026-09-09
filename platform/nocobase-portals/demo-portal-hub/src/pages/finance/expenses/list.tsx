import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Check, Clock, Eye, Pencil, Trash2, Wallet, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownDateRangePicker,
  DataTableFilterDropdownNumeric,
  DataTableFilterDropdownText,
} from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, lookup, optionLabel } from "../constants";
import {
  BulkActionBar,
  KpiStrip,
  ListToolbar,
  densityClass,
  exportCsv,
  storedColumnVisibility,
  useColumnVisibilityPersistence,
  usePersistentState,
  useSavedViews,
  type Density,
  type KpiTile,
  type SavedView,
} from "@/lib/table-kit";
import { useOpenContextualChild } from "../route-surfaces";
import { fmtDate, money, PageHeader, Pill } from "../shared";
import type { Expense } from "../types";

const RESOURCE = "hub_fin_expenses";
const STORAGE_KEY = "finance.expenses";

const dayOffsetIso = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export function ExpenseListPage() {
  return (
    <CanAccess resource={RESOURCE} action="list" fallback={<AccessDenied />}>
      <ExpenseList />
    </CanAccess>
  );
}

function employeeName(expense: Expense): string {
  return (
    expense.employee?.nickname ||
    expense.employee?.username ||
    expense.employee?.email ||
    "—"
  );
}

function ExpenseList() {
  const t = useTranslate();
  const openChild = useOpenContextualChild();
  const notify = useNotification();
  const { mutate, mutation } = useUpdate();
  const { mutateAsync: updateExpense } = useUpdate<Expense>();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const { result: allExpenses } = useList<Expense>({
    resource: RESOURCE,
    pagination: { mode: "off" },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const setStatus = useCallback(
    (id: number, status: "approved" | "rejected") =>
      mutate({
        resource: RESOURCE,
        id,
        values: { status },
        successNotification: {
          type: "success",
          message:
            status === "approved"
              ? t("finance.expenses.notify.approved", "Expense approved")
              : t("finance.expenses.notify.rejected", "Expense rejected"),
        },
      }),
    [mutate, t]
  );

  const statusOptions = useMemo(
    () =>
      EXPENSE_STATUSES.map((option) => ({
        value: option.value,
        label: optionLabel(option, t),
      })),
    [t]
  );
  const categoryOptions = useMemo(
    () =>
      EXPENSE_CATEGORIES.map((option) => ({
        value: option.value,
        label: optionLabel(option, t),
      })),
    [t]
  );

  // The approver's queues, in the order a finance controller works them.
  const presetViews: SavedView[] = useMemo(
    () => [
      { id: "all", label: t("finance.expenses.views.all", "All claims"), filters: [] },
      {
        id: "pending",
        label: t("finance.expenses.views.pending", "Awaiting approval"),
        filters: [{ id: "status", value: ["pending"] }],
      },
      {
        id: "approved",
        label: t("finance.expenses.views.approved", "Approved, unpaid"),
        filters: [{ id: "status", value: ["approved"] }],
      },
      {
        id: "reimbursed",
        label: t("finance.expenses.views.reimbursed", "Reimbursed"),
        filters: [{ id: "status", value: ["reimbursed"] }],
      },
      {
        id: "large",
        label: t("finance.expenses.views.large", "Over $500"),
        filters: [{ id: "amount", value: "500" }],
      },
      {
        id: "last30",
        label: t("finance.expenses.views.last30", "Last 30 days"),
        filters: [{ id: "spent_at", value: [dayOffsetIso(-30), dayOffsetIso(1)] }],
      },
    ],
    [t]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<Expense>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={t("finance.ops.selectAll", "Select all")}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("finance.ops.selectRow", "Select row")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("title", {
        id: "title",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.expenses.col.title", "Claim")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => openChild(`show/${row.original.id}`)}
          >
            {row.original.title || "—"}
          </button>
        ),
      }),
      columnHelper.display({
        id: "employee",
        header: t("finance.expenses.col.employee", "Employee"),
        enableSorting: false,
        cell: ({ row }) => employeeName(row.original),
      }),
      columnHelper.accessor("category", {
        id: "category",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.expenses.col.category", "Category")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={categoryOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const option = lookup(EXPENSE_CATEGORIES, getValue());
          return <Pill option={option} label={optionLabel(option, t)} />;
        },
      }),
      columnHelper.accessor("amount", {
        id: "amount",
        header: ({ column, table }) => (
          <div className="flex items-center justify-end gap-1">
            <span>{t("finance.expenses.col.amount", "Amount")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownNumeric
              column={column}
              table={table}
              defaultOperator="gte"
              operators={["gte", "lte", "eq"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <div className="text-right font-medium tabular-nums">
            {money(getValue(), true)}
          </div>
        ),
      }),
      columnHelper.accessor("spent_at", {
        id: "spent_at",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.expenses.col.spentAt", "Spent")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{fmtDate(getValue())}</span>
        ),
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.expenses.col.status", "Status")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={statusOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const option = lookup(EXPENSE_STATUSES, getValue());
          return <Pill option={option} label={optionLabel(option, t)} />;
        },
      }),
      columnHelper.display({
        id: "actions",
        header: t("finance.common.actions", "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 200,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {row.original.status === "pending" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={mutation.isPending}
                  title={t("finance.expenses.approve", "Approve")}
                  className="text-emerald-600 hover:text-emerald-600"
                  onClick={() => setStatus(row.original.id, "approved")}
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={mutation.isPending}
                  title={t("finance.expenses.reject", "Reject")}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setStatus(row.original.id, "rejected")}
                >
                  <X />
                </Button>
              </>
            )}
            <ShowButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              title={t("finance.expenses.view", "View expense")}
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              title={t("finance.expenses.edit", "Edit expense")}
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              title={t("finance.expenses.delete", "Delete expense")}
            >
              <Trash2 />
            </DeleteButton>
          </div>
        ),
      }),
    ];
  }, [categoryOptions, mutation.isPending, openChild, setStatus, statusOptions, t]);

  const table = useTable<Expense>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: RESOURCE,
      syncWithLocation: true,
      meta: { appends: ["employee"] },
      sorters: { initial: [{ field: "spent_at", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<Expense>({
    resource: RESOURCE,
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    meta: { appends: ["employee"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<Expense>(
      "expenses",
      [
        { header: "Claim", value: (row) => row.title },
        { header: "Employee", value: (row) => employeeName(row) },
        { header: "Category", value: (row) => row.category },
        { header: "Amount", value: (row) => row.amount },
        { header: "Spent", value: (row) => row.spent_at },
        { header: "Status", value: (row) => row.status },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;
  const decidableRows = selectedRows.filter(
    (row) => row.original.status === "pending"
  );

  const applyBulkStatus = useCallback(
    async (status: "approved" | "rejected" | "reimbursed") => {
      // Approve/reject only make sense on pending claims; reimburse applies to
      // anything already approved.
      const eligible = selectedRows.filter((row) =>
        status === "reimbursed"
          ? row.original.status === "approved"
          : row.original.status === "pending"
      );
      setIsBulkBusy(true);
      try {
        for (const row of eligible) {
          await updateExpense({
            resource: RESOURCE,
            id: row.original.id,
            values: { status },
            successNotification: false,
          });
        }
        notify.open?.({
          type: "success",
          message: t(
            "finance.expenses.bulk.result",
            "{{done}} of {{total}} claims updated"
          )
            .replace("{{done}}", String(eligible.length))
            .replace("{{total}}", String(selectedRows.length)),
        });
        table.reactTable.resetRowSelection();
      } finally {
        setIsBulkBusy(false);
      }
    },
    [notify, selectedRows, t, table, updateExpense]
  );

  const tiles = useMemo<KpiTile[]>(() => {
    const rows = allExpenses?.data ?? [];
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedAmount = 0;
    let awaitingPayment = 0;
    let total = 0;
    for (const expense of rows) {
      const amount = Number(expense.amount) || 0;
      if (expense.status !== "rejected") total += amount;
      if (expense.status === "pending") {
        pendingCount += 1;
        pendingAmount += amount;
      }
      if (expense.status === "approved") awaitingPayment += amount;
      if (expense.status === "approved" || expense.status === "reimbursed") {
        approvedAmount += amount;
      }
    }

    return [
      {
        key: "awaiting",
        label: t("finance.expenses.kpi.awaiting", "Awaiting approval"),
        value: String(pendingCount),
        hint: t("finance.expenses.kpi.awaiting.hint2", "{{amount}} pending").replace(
          "{{amount}}",
          money(pendingAmount)
        ),
        icon: Clock,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
        onClick: () => savedViews.apply(presetViews[1]),
      },
      {
        key: "toPay",
        label: t("finance.expenses.kpi.toPay", "Approved, unpaid"),
        value: money(awaitingPayment),
        hint: t("finance.expenses.kpi.toPay.hint", "Cleared but not reimbursed"),
        icon: Wallet,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        onClick: () => savedViews.apply(presetViews[2]),
      },
      {
        key: "approved",
        label: t("finance.expenses.kpi.approved", "Approved & reimbursed"),
        value: money(approvedAmount),
        hint: t("finance.expenses.kpi.approved.hint", "Cleared claims"),
        icon: Check,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
      {
        key: "total",
        label: t("finance.expenses.kpi.total", "Total claimed"),
        value: money(total),
        hint: t("finance.expenses.kpi.total.hint", "Excludes rejected"),
        icon: Wallet,
        tone: "text-violet-600 bg-violet-500/12 dark:text-violet-400",
      },
    ];
  }, [allExpenses?.data, presetViews, savedViews, t]);

  const columnLabels = useMemo(
    () => ({
      title: t("finance.expenses.col.title", "Claim"),
      employee: t("finance.expenses.col.employee", "Employee"),
      category: t("finance.expenses.col.category", "Category"),
      amount: t("finance.expenses.col.amount", "Amount"),
      spent_at: t("finance.expenses.col.spentAt", "Spent"),
      status: t("finance.expenses.col.status", "Status"),
    }),
    [t]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("finance.expenses.title", "Expenses")}
        description={t(
          "finance.expenses.subtitle",
          "Employee expense claims — review, approve and reimburse."
        )}
        createResource={RESOURCE}
        createLabel={t("finance.expenses.new", "New expense")}
      />

      <KpiStrip tiles={tiles} />

      <div className="flex flex-col gap-3">
        <ListToolbar i18nPrefix="finance.ops"
          table={table}
          savedViews={savedViews}
          density={density}
          onDensityChange={setDensity}
          columnLabels={columnLabels}
          onExport={handleExport}
          isExporting={exportQuery.query.isFetching}
        />

        <BulkActionBar i18nPrefix="finance.ops"
          count={selectedRows.length}
          isBusy={isBulkBusy}
          onClear={() => table.reactTable.resetRowSelection()}
        >
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isBulkBusy || decidableRows.length === 0}
            onClick={() => void applyBulkStatus("approved")}
          >
            <Check className="size-3.5" />
            {t("finance.expenses.bulk.approve", "Approve {{count}}").replace(
              "{{count}}",
              String(decidableRows.length)
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            disabled={isBulkBusy || decidableRows.length === 0}
            onClick={() => void applyBulkStatus("rejected")}
          >
            <X className="size-3.5" />
            {t("finance.expenses.bulk.reject", "Reject")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isBulkBusy}
            onClick={() => void applyBulkStatus("reimbursed")}
          >
            {t("finance.expenses.bulk.reimburse", "Mark reimbursed")}
          </Button>
        </BulkActionBar>

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </div>
  );
}
