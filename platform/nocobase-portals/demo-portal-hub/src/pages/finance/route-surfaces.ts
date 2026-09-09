import {
  createRouteSurfaceNavigationState,
  resolveRouteSurfaceCloseTo,
} from "@nocobase/portal-sdk/routing";
import { useCallback, useRef } from "react";
import { useLocation, useNavigate, useResolvedPath } from "react-router";

/** Navigate to a route-surface child (e.g. an "edit" or "approve" drawer)
 * relative to the current URL, carrying enough navigation state for the
 * child to know where to return on close. */
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

/** Resolve where a drawer should navigate back to on close: the parent
 * drawer if opened contextually, otherwise the resource list. */
export function useContextualCloseTo() {
  const location = useLocation();
  const parent = useResolvedPath("..");
  const closeTo = useRef(resolveRouteSurfaceCloseTo(location.state, parent));

  return closeTo.current;
}
