import { useList, useNotification, useTranslate } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { INDUSTRIES, labelFor } from "./constants";
import { useDebouncedValue } from "./list-controls";
import type { CustomerRecord } from "./types";

type Translate = ReturnType<typeof useTranslate>;

/**
 * Keep the duplicate-account check shared between the full and quick forms so
 * both entry points apply the same guard rail before an account is written.
 */
export function DuplicateCustomerWarning({
  name,
  currentId,
  translate,
  enabled = true,
}: {
  name: string;
  currentId?: string | number;
  translate: Translate;
  enabled?: boolean;
}) {
  const debounced = useDebouncedValue(name.trim(), 400);
  const { result } = useList<CustomerRecord>({
    resource: "crm_customers",
    filters: [
      { field: "company_name", operator: "contains", value: debounced },
    ],
    pagination: { mode: "server", currentPage: 1, pageSize: 3 },
    meta: { fields: ["id", "company_name"] },
    errorNotification: false,
    queryOptions: {
      enabled: enabled && debounced.length >= 3,
      retry: false,
    },
  });
  if (!enabled || debounced.length < 3) return null;

  const matches = result.data.filter(
    (record) => String(record.id) !== String(currentId ?? "")
  );
  if (matches.length === 0) return null;

  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {translate(
          "crm.customers.duplicate",
          { ns: "starter" },
          "An account with a similar name already exists:"
        )}{" "}
        <span className="font-medium">
          {matches.map((record) => record.company_name).join(", ")}
        </span>
      </span>
    </p>
  );
}

export function QuickCreateCustomerDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (record: { id: string | number; company_name?: string }) => void;
}): ReactNode {
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCompanyName(initialName ?? "");
    setIndustry("");
    setPhone("");
    setSubmitted(false);
  }, [initialName, open]);

  const blockers = useMemo(() => {
    if (companyName.trim()) return [];
    return [
      translate(
        "crm.quickCreate.customerNameRequired",
        { ns: "starter" },
        "Company name is required."
      ),
    ];
  }, [companyName, translate]);

  const createCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (blockers.length > 0 || creating) return;

    setCreating(true);
    try {
      const record = await nocobaseClient.action<{
        id: string | number;
        company_name?: string;
      }>("crm_customers", "create", {
        body: {
          company_name: companyName.trim(),
          industry: industry || null,
          phone: phone.trim() || null,
          status: "active",
        },
      });
      await queryClient.invalidateQueries();
      onCreated(record);
      notify?.({
        type: "success",
        message: translate(
          "crm.quickCreate.customerCreated",
          { ns: "starter" },
          "Customer created"
        ),
        description: translate(
          "crm.quickCreate.customerCreatedDescription",
          { ns: "starter" },
          "The new customer is selected in the form."
        ),
      });
      onOpenChange(false);
    } catch (error) {
      notify?.({
        type: "error",
        message: translate(
          "crm.quickCreate.customerError",
          { ns: "starter" },
          "Could not create customer"
        ),
        description:
          error instanceof Error
            ? error.message
            : translate(
                "crm.quickCreate.tryAgain",
                { ns: "starter" },
                "Please try again."
              ),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              "crm.quickCreate.customerTitle",
              { ns: "starter" },
              "Create customer"
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              "crm.quickCreate.customerDescription",
              { ns: "starter" },
              "Add the account without leaving this form."
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={createCustomer}>
          <div className="space-y-2">
            <Label htmlFor="quick-customer-name">
              {translate(
                "crm.quickCreate.companyName",
                { ns: "starter" },
                "Company name"
              )}
            </Label>
            <Input
              id="quick-customer-name"
              value={companyName}
              onChange={(event) => setCompanyName(event.currentTarget.value)}
              autoFocus
            />
            <DuplicateCustomerWarning
              name={companyName}
              translate={translate}
              enabled={open}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-customer-industry">
                {translate(
                  "crm.quickCreate.industry",
                  { ns: "starter" },
                  "Industry"
                )}
              </Label>
              <NativeSelect
                id="quick-customer-industry"
                value={industry}
                onChange={(event) => setIndustry(event.currentTarget.value)}
              >
                <NativeSelectOption value="">
                  {translate(
                    "crm.quickCreate.unspecified",
                    { ns: "starter" },
                    "Unspecified"
                  )}
                </NativeSelectOption>
                {INDUSTRIES.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {labelFor(INDUSTRIES, option.value, translate)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-customer-phone">
                {translate("crm.quickCreate.phone", { ns: "starter" }, "Phone")}
              </Label>
              <Input
                id="quick-customer-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </div>
          </div>
          {submitted && blockers.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              {translate("crm.quickCreate.cancel", { ns: "starter" }, "Cancel")}
            </Button>
            <Button type="submit" disabled={creating}>
              {creating
                ? translate(
                    "crm.quickCreate.creatingCustomer",
                    { ns: "starter" },
                    "Creating..."
                  )
                : translate(
                    "crm.quickCreate.createCustomer",
                    { ns: "starter" },
                    "Create customer"
                  )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuickCreateContactDialog({
  open,
  onOpenChange,
  customerId,
  initialName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | number;
  initialName?: string;
  onCreated: (record: { id: string | number; name?: string }) => void;
}): ReactNode {
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setEmail("");
    setPhone("");
    setJobTitle("");
    setSubmitted(false);
  }, [initialName, open]);

  const blockers = useMemo(() => {
    if (name.trim()) return [];
    return [
      translate(
        "crm.quickCreate.contactNameRequired",
        { ns: "starter" },
        "Contact name is required."
      ),
    ];
  }, [name, translate]);

  const createContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (blockers.length > 0 || creating) return;

    setCreating(true);
    try {
      const record = await nocobaseClient.action<{
        id: string | number;
        name?: string;
      }>("crm_contacts", "create", {
        body: {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          job_title: jobTitle.trim() || null,
          customer: customerId,
        },
      });
      await queryClient.invalidateQueries();
      onCreated(record);
      notify?.({
        type: "success",
        message: translate(
          "crm.quickCreate.contactCreated",
          { ns: "starter" },
          "Contact created"
        ),
        description: translate(
          "crm.quickCreate.contactCreatedDescription",
          { ns: "starter" },
          "The new contact is selected in the form."
        ),
      });
      onOpenChange(false);
    } catch (error) {
      notify?.({
        type: "error",
        message: translate(
          "crm.quickCreate.contactError",
          { ns: "starter" },
          "Could not create contact"
        ),
        description:
          error instanceof Error
            ? error.message
            : translate(
                "crm.quickCreate.tryAgain",
                { ns: "starter" },
                "Please try again."
              ),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              "crm.quickCreate.contactTitle",
              { ns: "starter" },
              "Create contact"
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              "crm.quickCreate.contactDescription",
              { ns: "starter" },
              "Add a contact to this account without leaving the form."
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={createContact}>
          <div className="space-y-2">
            <Label htmlFor="quick-contact-name">
              {translate(
                "crm.quickCreate.contactName",
                { ns: "starter" },
                "Name"
              )}
            </Label>
            <Input
              id="quick-contact-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-contact-email">
                {translate("crm.quickCreate.email", { ns: "starter" }, "Email")}
              </Label>
              <Input
                id="quick-contact-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-contact-phone">
                {translate("crm.quickCreate.phone", { ns: "starter" }, "Phone")}
              </Label>
              <Input
                id="quick-contact-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-contact-job-title">
              {translate(
                "crm.quickCreate.jobTitle",
                { ns: "starter" },
                "Job title"
              )}
            </Label>
            <Input
              id="quick-contact-job-title"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.currentTarget.value)}
            />
          </div>
          {submitted && blockers.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              {translate("crm.quickCreate.cancel", { ns: "starter" }, "Cancel")}
            </Button>
            <Button type="submit" disabled={creating}>
              {creating
                ? translate(
                    "crm.quickCreate.creatingContact",
                    { ns: "starter" },
                    "Creating..."
                  )
                : translate(
                    "crm.quickCreate.createContact",
                    { ns: "starter" },
                    "Create contact"
                  )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
