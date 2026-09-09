# Agent Note: ui-kg client bundle must stay a single artifact (browser boot blocker)

Status: implemented

English | [中文](2026-09-08-ui-kg-single-artifact-bundle.zh.md)

## Problem

Diagnosis [plans/diagnosis-2026-09-08.zh.md](../../../../plans/diagnosis-2026-09-08.zh.md) F1: every `dsh web` launch crashed the browser into a full-screen "Failed to load plugins" within 1–2 seconds. `KgGraphCanvas` loaded sigma/graphology/FA2 through dynamic `import()` — the only runtime dynamic import across all `dsh.client` packages — so rolldown split the bundle into five hashed chunks plus a `rolldown-runtime` chunk, and the factory's first line synchronously required them. The browser module table (`makeRequire`) resolves only platform seed words, memoized records, and registered package factories; it has no channel to fetch and execute relative-path chunks, so activation threw and took the whole plugin set down — all six workbench pages unusable, with or without the kb-agent patch. Inlining the stack surfaced a second blocker: sigma's npm dependency `events` shares its name with the Node built-in, and rolldown externalizes built-in names on the browser platform, leaking a bare `require("events")` the module table also cannot answer.

## Decision

### Static inlining in KgGraphCanvas (packages/client/ui-kg/src/client/KgGraphCanvas.tsx)

sigma, graphology, and force-atlas2 import statically; construction failure (no WebGL) still degrades to the relation list through try/catch — same behavior, no async race, the `killed` tracking removed together with the promise.

### Two build-time gates in the shared preset (packages/client/tsdown.client.ts)

`dsh-client-single-artifact` fails any client bundle that emits a chunk besides `client.js`(+map) — a future dynamic import in any dsh.client package now reds the build at the source of the split instead of dying in the browser. `dsh-npm-package-over-builtin` resolves `events` to the real npm package via sub-path resolution (`events/package.json` → its main file), bypassing the built-in name match in Node's resolver so the EventEmitter polyfill inlines.

### jsdom and route tests

The kg specs stub `WebGL2RenderingContext`/`WebGLRenderingContext` enum constants through `vi.hoisted` (sigma reads them at module top level; real browsers always define them); the details-panel assertion disambiguates the degraded list (span) from the panel (p). `node-half.client.spec.ts` pins the server side: `client.js` served, sibling chunk files refused with 404, dot-segment and percent-encoded traversal refused.

## Alternatives considered

**Serving the chunks through `/plugins/<id>/<file>` (diagnosis option a).** Rejected as the primary fix: HTTP 200 for a chunk does not make it loadable — the module table is a package-granularity, synchronous registry by design, and answering a relative-path `require("./rolldown-runtime-*.cjs")` needs a file-granularity loading protocol (chunk rows in the boot graph, async-but-synchronous require semantics) — a new subsystem, not a fix. The single-file output is the existing contract everywhere else: `entryFileNames: 'client.js'` pins it, every other ui-* package builds that way, and the `files` publish list never included chunk files — a split bundle was already broken in a real install, independent of the dev server. The bundle cost is bounded: ui-kg has no `immediately` flag, so only sessions opening the graph page fetch it, and the inlined stack lands at 76KB gzip.

**Keeping the lazy load via the module table (`dsh.client.external` rows for sigma).** Rejected: module-table rows answer package ids the table owns; sigma is an ordinary library, not a dsh package — the row would have no supplier, and composition would reject it.

## Consequences

- Rebuilt ui-kg lib contains exactly `client.js` (426.7KB / 76.3KB gzip) plus its map; `curl /plugins/@deepseek-ai/dsh-client-ui-kg/client.js` returns 200 and the browser console is clean — the six workbench pages navigate and render, and the graph page's seed-search → subgraph-walk → node-list chain works end to end (headless Chrome without WebGL degrades to the relation list by design).
- Any future dynamic `import()` in a dsh.client package fails `pnpm run build` with the single-artifact error instead of shipping a broken browser bundle.
- jsdom environments need the hoisted WebGL enum stub before importing KgView/KgGraphCanvas; the specs carry it inline.
- Same batch, same note: F2 (setup-nocobase's `all` chain verify now reads the just-written `.env` through the shared `resolveEnv`, so the README's first command exits 0) and F3 (the launcher-flag-order contract — launcher flags before the web app's own flags — documented in README.md/README.zh.md and QUICKSTART.zh.md with the verified `dsh web --patch <file> --no-open` form; commander's pass-through semantics left as designed).
