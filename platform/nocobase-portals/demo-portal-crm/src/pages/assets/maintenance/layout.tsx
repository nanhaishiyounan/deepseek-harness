import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { MaintenanceList } from "./list";

export function MaintenanceLayout() {
  return (
    <CanAccess
      resource="hub_as_maintenance"
      action="list"
      fallback={<AccessDenied />}
    >
      <MaintenanceList />
    </CanAccess>
  );
}
