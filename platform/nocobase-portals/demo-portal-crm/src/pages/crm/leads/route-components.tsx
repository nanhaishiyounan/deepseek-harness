import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { LeadCreate, LeadEdit } from "./form";
import { LeadShow, LeadsPage } from "./list";

export function LeadsRoute() {
  return (
    <CanAccess resource="crm_leads" action="list" fallback={<AccessDenied />}>
      <LeadsPage />
    </CanAccess>
  );
}

export function LeadShowRoute() {
  return (
    <CanAccess resource="crm_leads" action="show" fallback={<AccessDenied />}>
      <LeadShow />
    </CanAccess>
  );
}

export function LeadCreateRoute() {
  return (
    <CanAccess resource="crm_leads" action="create" fallback={<AccessDenied />}>
      <LeadCreate />
    </CanAccess>
  );
}

export function LeadEditRoute() {
  return (
    <CanAccess resource="crm_leads" action="edit" fallback={<AccessDenied />}>
      <LeadEdit />
    </CanAccess>
  );
}
