import {
  createRouteSurfaceNavigationState,
  resolveRouteSurfaceCloseTo,
} from "@nocobase/portal-sdk/routing";
import { useCallback, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useResolvedPath,
} from "react-router";

/**
 * Opens a contextual child route (a drawer) relative to the current route.
 * From the list at `/asset-registry`, `openChild("show/1")` lands on
 * `/asset-registry/show/1`; from an open drawer at `/asset-registry/show/1`,
 * `openChild("assign")` stacks a nested drawer at `/asset-registry/show/1/assign`.
 */
export function useOpenContextualChild() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string) =>
      navigate(to, {
        state: createRouteSurfaceNavigationState(location),
      }),
    [location, navigate]
  );
}

export function useContextualCloseTo() {
  const location = useLocation();
  const parent = useResolvedPath("..");
  const closeTo = useRef(
    resolveRouteSurfaceCloseTo(location.state, parent)
  );

  return closeTo.current;
}
