import { useParams } from "react-router";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { FollowUpCreate, FollowUpEdit } from "./form";
import { FollowUpShow } from "./show";

export function FollowUpCreateRoute() {
  return (
    <CanAccess resource="crm_follow_ups" action="create" fallback={<AccessDenied />}>
      <FollowUpCreate />
    </CanAccess>
  );
}

export function FollowUpEditRoute() {
  return (
    <CanAccess resource="crm_follow_ups" action="edit" fallback={<AccessDenied />}>
      <FollowUpEdit />
    </CanAccess>
  );
}

export function FollowUpShowRoute() {
  return (
    <CanAccess resource="crm_follow_ups" action="show" fallback={<AccessDenied />}>
      <FollowUpShow />
    </CanAccess>
  );
}

export function CustomerFollowUpCreateRoute() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanAccess resource="crm_follow_ups" action="create" fallback={<AccessDenied />}>
      <FollowUpCreate presetCustomerId={id} />
    </CanAccess>
  );
}

export function CustomerFollowUpEditRoute() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanAccess resource="crm_follow_ups" action="edit" fallback={<AccessDenied />}>
      <FollowUpEdit presetCustomerId={id} idParam="followUpId" />
    </CanAccess>
  );
}
