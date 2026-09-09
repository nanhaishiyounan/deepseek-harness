import { useOne } from "@refinedev/core";
import { useParams } from "react-router";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import type { DealRecord } from "../types";
import { QuoteCreate, QuoteEdit } from "./form";
import { QuoteShow, QuotesPage } from "./list";

function DealQuoteCreate({ dealParam }: { dealParam: "id" | "dealId" }) {
  const params = useParams<Record<string, string>>();
  const dealId = params[dealParam];
  const { result: deal, query } = useOne<DealRecord>({
    resource: "crm_deals",
    id: dealId,
    queryOptions: { enabled: Boolean(dealId), retry: false },
  });

  if (query.isLoading) return null;

  const customerId =
    deal?.customer_id != null ? String(deal.customer_id) : undefined;

  return <QuoteCreate presetCustomerId={customerId} presetDealId={dealId} />;
}

export function QuotesRoute() {
  return (
    <CanAccess resource="crm_quotes" action="list" fallback={<AccessDenied />}>
      <QuotesPage />
    </CanAccess>
  );
}

export function QuoteShowRoute() {
  return (
    <CanAccess resource="crm_quotes" action="show" fallback={<AccessDenied />}>
      <QuoteShow />
    </CanAccess>
  );
}

export function QuoteCreateRoute() {
  return (
    <CanAccess resource="crm_quotes" action="create" fallback={<AccessDenied />}>
      <QuoteCreate />
    </CanAccess>
  );
}

export function QuoteEditRoute() {
  return (
    <CanAccess resource="crm_quotes" action="edit" fallback={<AccessDenied />}>
      <QuoteEdit />
    </CanAccess>
  );
}

export function DealQuoteCreateRoute() {
  return (
    <CanAccess resource="crm_quotes" action="create" fallback={<AccessDenied />}>
      <DealQuoteCreate dealParam="id" />
    </CanAccess>
  );
}

export function CustomerDealQuoteCreateRoute() {
  return (
    <CanAccess resource="crm_quotes" action="create" fallback={<AccessDenied />}>
      <DealQuoteCreate dealParam="dealId" />
    </CanAccess>
  );
}

export function NestedQuoteShowRoute() {
  return (
    <CanAccess resource="crm_quotes" action="show" fallback={<AccessDenied />}>
      <QuoteShow idParam="quoteId" />
    </CanAccess>
  );
}
