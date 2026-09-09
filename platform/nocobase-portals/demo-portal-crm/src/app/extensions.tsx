import {
  Suspense,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  collectAppExtensionContributions,
  type AppExtension,
} from "@nocobase/portal-sdk/extensions";
import {
  buildRouteResources,
  renderAppRoutes,
} from "@nocobase/portal-sdk/routing";
import { LoadingState } from "@/components/app-shell/loading-state";
import { appRoutes, registryRoutesEnabled } from "@/routes";
import { createDevelopmentRoute } from "./development";
import { RouteAccessGuard } from "./route-access-guard";

const extensionModules = import.meta.glob<{ default: AppExtension }>(
  "@/extensions/*/extension.tsx",
  { eager: true }
);

const unavailableOptionalRuntimeExtensions = new Set([
  "nocobase-auth-oidc",
  "nocobase-auth-saml",
]);

const configuredExtensions: AppExtension[] = Object.values(extensionModules).map(
  ({ default: extension }) => {
    if (extension.id === "nocobase-mail") {
      return { ...extension, Provider: undefined };
    }
    if (unavailableOptionalRuntimeExtensions.has(extension.id)) {
      return { ...extension, AuthRuntimeProvider: undefined };
    }
    return extension;
  }
);

const extensionContributions = collectAppExtensionContributions({
  // Mail demos remain installed, but this CRM runtime does not expose the
  // unread-count API. Compose out only its global polling provider so the
  // production shell does not issue a failing optional request on every page.
  // OIDC and SAML demos also remain installed, while their auto-redirect
  // providers are omitted because this runtime does not expose those APIs.
  extensions: configuredExtensions,
  appRoutes,
  registryRoutesEnabled,
});

export const appExtensions = extensionContributions.extensions;

export const configuredResources = [
  ...buildRouteResources(extensionContributions.routeDefinitions),
  ...extensionContributions.resources,
];

export const configuredRouteElements = renderAppRoutes(
  extensionContributions.routeDefinitions,
  {
    AccessGuard: RouteAccessGuard,
  }
);

export const extensionStandaloneRouteElements = import.meta.env.DEV
  ? [createDevelopmentRoute(appExtensions)]
  : [];

export const extensionUserMenuItems = extensionContributions.userMenuItems;

export const extensionAuthAdapters = extensionContributions.authAdapters;

export function AppExtensionProviders({ children }: PropsWithChildren) {
  return extensionContributions.providerExtensions.reduceRight<ReactNode>(
    (content, extension) => {
      const Provider = extension.Provider;
      return Provider ? <Provider>{content}</Provider> : content;
    },
    children
  );
}

export function AppAuthRuntimeProviders({ children }: PropsWithChildren) {
  return extensionContributions.authRuntimeExtensions.reduceRight<ReactNode>(
    (content, extension) => {
      const Provider = extension.AuthRuntimeProvider!;
      return (
        <Suspense fallback={<LoadingState fullscreen />}>
          <Provider>{content}</Provider>
        </Suspense>
      );
    },
    children
  );
}
