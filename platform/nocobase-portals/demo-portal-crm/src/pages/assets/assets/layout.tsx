import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { AssetList } from "./list";

export function AssetsLayout() {
  return (
    <CanAccess
      resource="hub_as_assets"
      action="list"
      fallback={<AccessDenied />}
    >
      <AssetList />
    </CanAccess>
  );
}
