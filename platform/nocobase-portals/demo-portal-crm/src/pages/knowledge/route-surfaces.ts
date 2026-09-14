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
 * Navigate to a URL-backed child surface (drawer) relative to the current
 * route — e.g. `openChild("edit/12")` from the list opens the edit drawer.
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

/** Where a drawer returns to when it closes: the parent route. */
export function useContextualCloseTo() {
  const location = useLocation();
  const parent = useResolvedPath("..");
  const closeTo = useRef(
    resolveRouteSurfaceCloseTo(location.state, parent)
  );

  return closeTo.current;
}

/**
 * Navigate to an absolute app route that lives outside the current route's
 * subtree (e.g. from `/my-tasks` or `/project-calendar` into the `/tasks`
 * module's `show/:id` drawer). Carries a return-to state so the opened
 * drawer's close button lands back on the page that opened it, not on its
 * literal parent route.
 */
export function useOpenAbsolute() {
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
