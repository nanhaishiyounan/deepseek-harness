import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import {
  portalRawIndexHtmlPlugin,
  portalSdkCompatibilityPlugin,
} from "@nocobase/portal-sdk/vite";

const portalTemplate = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")
) as { displayName: string; version: string };

const getDefaultProxyTarget = (apiUrl?: string) => {
  if (!apiUrl || apiUrl.startsWith("/")) return undefined;

  try {
    return new URL(apiUrl).origin;
  } catch {
    return undefined;
  }
};

const getProxyPath = (apiUrl?: string) => {
  if (!apiUrl) return "/api";
  if (apiUrl.startsWith("/")) return apiUrl;

  try {
    return new URL(apiUrl).pathname || "/api";
  } catch {
    return "/api";
  }
};

const normalizeBase = (base?: string) => {
  const normalized = String(base || "/").trim();
  if (!normalized || normalized === "/") return "/";
  return `/${normalized.replace(/^\/+|\/+$/g, "")}/`;
};

// The Playwright suites assert the upstream English copy, but this deployment
// pins systemSettings.enabledLanguages to ["zh-CN"] on both layers (the verify
// gate locks that value), and app:getLang echoes the signed-in user's zh-CN
// profile regardless of the requested locale. The portal-sdk locale resolver
// and the server-resources bootstrap would therefore force every page to
// zh-CN. Under `vite --mode e2e` only, the dev server pins the browser to
// en-US: the index document seeds the stored locale before the app boots, the
// proxied systemSettings response gains en-US in its enabled-language lists so
// resolveSystemLocale accepts the stored value, and the proxied app:getLang
// response reports lang=en-US so loadServerLocaleResources keeps it.
// Production (:13000/:3080) and the verify gate stay untouched.
const portalE2EEnglishLocalePlugin = (upstreamOrigin: string): Plugin => ({
  name: "portal-e2e-english-locale",
  transformIndexHtml(html) {
    return html.replace(
      "<head>",
      `<head><script>try{localStorage.setItem("NOCOBASE_LOCALE","en-US")}catch{}</script>`
    );
  },
  configureServer(server) {
    const proxyJson = async (
      pathWithSearch: string,
      headers: Record<string, string>,
      patch: (payload: Record<string, unknown>) => void,
      res: ServerResponse
    ) => {
      try {
        const upstream = await fetch(`${upstreamOrigin}${pathWithSearch}`, {
          headers: { accept: "application/json", ...headers },
          signal: AbortSignal.timeout(10_000),
        });
        const payload = (await upstream.json()) as Record<string, unknown>;
        patch(payload);
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      } catch {
        res.statusCode = 502;
        res.end(`{"errors":["e2e locale patch: upstream fetch failed for ${pathWithSearch.split("?")[0]}"]}`);
      }
    };

    server.middlewares.use("/api/systemSettings:get", (req, res) => {
      void proxyJson("/api/systemSettings:get", {}, (payload) => {
        const data = (payload.data ?? {}) as {
          enabledLanguages?: string[];
          options?: { enabledLanguages?: string[] };
        };
        const withEnglish = (languages?: string[]) =>
          languages ? Array.from(new Set([...languages, "en-US"])) : ["en-US"];
        data.enabledLanguages = withEnglish(data.enabledLanguages);
        if (data.options) {
          data.options.enabledLanguages = withEnglish(data.options.enabledLanguages);
        }
        payload.data = data;
      }, res as ServerResponse);
    });

    server.middlewares.use("/api/app:getLang", (req, res) => {
      const search = (req.url ?? "").split("?")[1] ?? "";
      void proxyJson(
        `/api/app:getLang${search ? `?${search}` : ""}`,
        { cookie: req.headers.cookie ?? "" },
        (payload) => {
          const data = (payload.data ?? {}) as { lang?: string };
          data.lang = "en-US";
          payload.data = data;
        },
        res as ServerResponse
      );
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = getDefaultProxyTarget(env.NOCOBASE_API_URL);
  const proxyOrigin = proxyTarget
    ? (() => {
        try {
          return new URL(proxyTarget).origin;
        } catch {
          return undefined;
        }
      })()
    : undefined;

  const portalBase = normalizeBase(env.NOCOBASE_PORTAL_BASE);
  const registrySourceRoot = path.resolve(__dirname, "./registry");
  const extensionsRoot = fs.existsSync(registrySourceRoot)
    ? registrySourceRoot
    : path.resolve(__dirname, "./src/extensions");

  return {
    base: portalBase,
    define: {
      __PORTAL_DEV_SOURCE_ROOT__: JSON.stringify(
        command === "serve" ? path.resolve(__dirname) : ""
      ),
      __PORTAL_TEMPLATE_NAME__: JSON.stringify(portalTemplate.displayName),
      __PORTAL_TEMPLATE_VERSION__: JSON.stringify(portalTemplate.version),
    },
    envPrefix: ["VITE_", "NOCOBASE_", "API_CLIENT_"],
    plugins: [
      portalSdkCompatibilityPlugin({ root: __dirname }),
      react(),
      tailwindcss(),
      portalRawIndexHtmlPlugin({ root: __dirname, base: portalBase }),
      ...(mode === "e2e" && proxyOrigin
        ? [portalE2EEnglishLocalePlugin(proxyOrigin)]
        : []),
    ],
    resolve: {
      alias: {
        "@/extensions": extensionsRoot,
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: proxyTarget
      ? {
          proxy: {
            [getProxyPath(env.NOCOBASE_API_URL)]: {
              target: proxyTarget,
              changeOrigin: true,
              secure: false,
              configure(proxy) {
                proxy.on("proxyReq", (proxyRequest, request) => {
                  if (!request.url?.includes("aiConversations:")) return;
                  proxyRequest.setHeader("accept-encoding", "identity");
                  proxyRequest.setHeader("cache-control", "no-cache");
                });
                proxy.on("proxyRes", (proxyResponse) => {
                  const contentType = String(
                    proxyResponse.headers["content-type"] ?? ""
                  );
                  if (!contentType.includes("text/event-stream")) return;
                  delete proxyResponse.headers["content-length"];
                  proxyResponse.headers["cache-control"] =
                    "no-cache, no-transform";
                  proxyResponse.headers["x-accel-buffering"] = "no";
                });
              },
              headers: proxyOrigin
                ? {
                    origin: proxyOrigin,
                    referer: `${proxyOrigin}/`,
                  }
                : undefined,
            },
          },
        }
      : undefined,
  };
});
