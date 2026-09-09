import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { TargetsPage } from "./page";

export function TargetsRoute() {
  return (
    <CanAccess resource="crm_targets" action="list" fallback={<AccessDenied />}>
      <TargetsPage />
    </CanAccess>
  );
}
