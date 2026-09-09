import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ContactCreate, ContactEdit } from "./form";
import { ContactShow, ContactsPage } from "./list";

export function ContactsRoute() {
  return (
    <CanAccess resource="crm_contacts" action="list" fallback={<AccessDenied />}>
      <ContactsPage />
    </CanAccess>
  );
}

export function ContactShowRoute() {
  return (
    <CanAccess resource="crm_contacts" action="show" fallback={<AccessDenied />}>
      <ContactShow />
    </CanAccess>
  );
}

export function ContactCreateRoute() {
  return (
    <CanAccess resource="crm_contacts" action="create" fallback={<AccessDenied />}>
      <ContactCreate />
    </CanAccess>
  );
}

export function ContactEditRoute() {
  return (
    <CanAccess resource="crm_contacts" action="edit" fallback={<AccessDenied />}>
      <ContactEdit />
    </CanAccess>
  );
}
