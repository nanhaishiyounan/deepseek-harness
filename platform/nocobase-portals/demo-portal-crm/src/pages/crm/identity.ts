import { useGetIdentity } from "@refinedev/core";
import type { AclIdentity } from "@nocobase/portal-sdk/acl";
import { useMemo } from "react";

export type CrmIdentity = {
  userId: string | null;
  roleNames: string[];
  isAdmin: boolean;
  isLoading: boolean;
};

export function useCrmIdentity(): CrmIdentity {
  const { data: identity, isLoading } = useGetIdentity<AclIdentity>();
  const roleNames = useMemo(() => {
    // Older identity adapters may return one role object instead of an array.
    const rawRoles: unknown = identity?.roles;
    const roles = Array.isArray(rawRoles)
      ? rawRoles
      : rawRoles
        ? [rawRoles]
        : [];

    return roles.flatMap((role) => {
      if (typeof role !== "object" || role === null || !("name" in role)) {
        return [];
      }
      return typeof role.name === "string" ? [role.name.toLowerCase()] : [];
    });
  }, [identity?.roles]);
  const identityId: unknown = identity?.id;
  const userId =
    isLoading || identityId === null || identityId === undefined
      ? null
      : String(identityId);

  return {
    userId,
    roleNames,
    isAdmin: roleNames.includes("root") || roleNames.includes("admin"),
    isLoading,
  };
}
