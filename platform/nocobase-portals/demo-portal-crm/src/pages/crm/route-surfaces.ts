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

export function useOpenContextualChild() {
  const navigate = useNavigate();
  const location = useLocation();

  // Lists keep their filter state in the query string. A relative navigate
  // would drop it, so the current search is carried onto the child surface and
  // the list behind the drawer stays exactly as the visitor left it.
  return useCallback(
    (to: string) =>
      navigate(to.includes("?") ? to : `${to}${location.search}`, {
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
