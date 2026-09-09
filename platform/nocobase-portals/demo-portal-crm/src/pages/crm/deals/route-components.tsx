import { useParams } from "react-router";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { DealCreate, DealEdit } from "./form";
import { PipelinePage } from "./pipeline";
import { DealShow } from "./show";

export function PipelineRoute() {
  return (
    <CanAccess resource="crm_deals" action="list" fallback={<AccessDenied />}>
      <PipelinePage />
    </CanAccess>
  );
}

export function DealCreateRoute() {
  return (
    <CanAccess resource="crm_deals" action="create" fallback={<AccessDenied />}>
      <DealCreate />
    </CanAccess>
  );
}

export function DealEditRoute() {
  return (
    <CanAccess resource="crm_deals" action="edit" fallback={<AccessDenied />}>
      <DealEdit />
    </CanAccess>
  );
}

export function CustomerDealCreateRoute() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanAccess resource="crm_deals" action="create" fallback={<AccessDenied />}>
      <DealCreate presetCustomerId={id} />
    </CanAccess>
  );
}

export function CustomerDealEditRoute() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanAccess resource="crm_deals" action="edit" fallback={<AccessDenied />}>
      <DealEdit presetCustomerId={id} idParam="dealId" />
    </CanAccess>
  );
}

export function DealShowRoute() {
  return (
    <CanAccess resource="crm_deals" action="show" fallback={<AccessDenied />}>
      <DealShow />
    </CanAccess>
  );
}

export function CustomerDealShowRoute() {
  return (
    <CanAccess resource="crm_deals" action="show" fallback={<AccessDenied />}>
      <DealShow idParam="dealId" />
    </CanAccess>
  );
}
