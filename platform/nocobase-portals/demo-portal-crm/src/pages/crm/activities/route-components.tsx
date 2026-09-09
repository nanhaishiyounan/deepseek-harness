import { useOne } from "@refinedev/core";
import { useParams } from "react-router";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import type { DealRecord } from "../types";
import { ActivityCreate, ActivityEdit } from "./form";
import { ActivityShow } from "./show";

function DealActivityCreate({ dealParam }: { dealParam: "id" | "dealId" }) {
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

  return (
    <ActivityCreate presetCustomerId={customerId} presetDealId={dealId} />
  );
}

export function ActivityCreateRoute() {
  return (
    <CanAccess resource="crm_activities" action="create" fallback={<AccessDenied />}>
      <ActivityCreate />
    </CanAccess>
  );
}

export function ActivityEditRoute() {
  return (
    <CanAccess resource="crm_activities" action="edit" fallback={<AccessDenied />}>
      <ActivityEdit />
    </CanAccess>
  );
}

export function ActivityShowRoute() {
  return (
    <CanAccess resource="crm_activities" action="show" fallback={<AccessDenied />}>
      <ActivityShow />
    </CanAccess>
  );
}

export function CustomerActivityCreateRoute() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanAccess resource="crm_activities" action="create" fallback={<AccessDenied />}>
      <ActivityCreate presetCustomerId={id} />
    </CanAccess>
  );
}

export function CustomerActivityEditRoute() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanAccess resource="crm_activities" action="edit" fallback={<AccessDenied />}>
      <ActivityEdit presetCustomerId={id} idParam="activityId" />
    </CanAccess>
  );
}

export function DealActivityCreateRoute() {
  return (
    <CanAccess resource="crm_activities" action="create" fallback={<AccessDenied />}>
      <DealActivityCreate dealParam="id" />
    </CanAccess>
  );
}

export function CustomerDealActivityCreateRoute() {
  return (
    <CanAccess resource="crm_activities" action="create" fallback={<AccessDenied />}>
      <DealActivityCreate dealParam="dealId" />
    </CanAccess>
  );
}

export function NestedActivityEditRoute() {
  return (
    <CanAccess resource="crm_activities" action="edit" fallback={<AccessDenied />}>
      <ActivityEdit idParam="activityId" />
    </CanAccess>
  );
}
