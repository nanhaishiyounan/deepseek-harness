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
