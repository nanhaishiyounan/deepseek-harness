import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ReportsPage } from "./page";

export function ReportsRoute() {
  return (
    <CanAccess resource="crm_deals" action="list" fallback={<AccessDenied />}>
      <ReportsPage />
    </CanAccess>
  );
}
