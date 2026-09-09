import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { CustomerCreate, CustomerEdit } from "./create-edit";
import { CustomerShow } from "./show";

export function CustomerCreateRoute() {
  return (
    <CanAccess resource="crm_customers" action="create" fallback={<AccessDenied />}>
      <CustomerCreate />
    </CanAccess>
  );
}

export function CustomerEditRoute() {
  return (
    <CanAccess resource="crm_customers" action="edit" fallback={<AccessDenied />}>
      <CustomerEdit />
    </CanAccess>
  );
}

export function CustomerShowRoute() {
  return (
    <CanAccess resource="crm_customers" action="show" fallback={<AccessDenied />}>
      <CustomerShow />
    </CanAccess>
  );
}
