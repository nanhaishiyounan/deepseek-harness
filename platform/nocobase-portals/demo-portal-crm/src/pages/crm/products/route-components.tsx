import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ProductCreate, ProductEdit } from "./form";
import { ProductsPage } from "./list";
import { ProductShow } from "./show";

export function ProductsRoute() {
  return (
    <CanAccess resource="crm_products" action="list" fallback={<AccessDenied />}>
      <ProductsPage />
    </CanAccess>
  );
}

export function ProductShowRoute() {
  return (
    <CanAccess resource="crm_products" action="show" fallback={<AccessDenied />}>
      <ProductShow />
    </CanAccess>
  );
}

export function ProductCreateRoute() {
  return (
    <CanAccess resource="crm_products" action="create" fallback={<AccessDenied />}>
      <ProductCreate />
    </CanAccess>
  );
}

export function ProductEditRoute() {
  return (
    <CanAccess resource="crm_products" action="edit" fallback={<AccessDenied />}>
      <ProductEdit />
    </CanAccess>
  );
}
