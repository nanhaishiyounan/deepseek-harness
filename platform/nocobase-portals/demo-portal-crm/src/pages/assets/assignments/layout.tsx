import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { AssignmentList } from "./list";

export function AssignmentsLayout() {
  return (
    <CanAccess
      resource="hub_as_assignments"
      action="list"
      fallback={<AccessDenied />}
    >
      <AssignmentList />
    </CanAccess>
  );
}
