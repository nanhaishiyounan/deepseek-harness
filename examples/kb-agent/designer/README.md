# kb-agent-approval-designer

English | [中文](README.zh.md)

The W5-B0 approval-flow visual designer SPA (React18 + antd5 + @xyflow/react 12, one esbuild bundle). Served same-origin under `/designer` by `examples/kb-agent/scripts/approval-engine.mts --serve`; `dist/` is a committed build artifact, so a fresh checkout serves it without a build step.

## Build, typecheck and lint

```sh
npm run build      # node esbuild.mjs → dist/designer.js + dist/designer.css
npm run typecheck  # 对 src/ 跑 tsc --noEmit（0 错误为门禁）
pnpm run lint      # 仓库根目录；designer/src 纳入同等 oxlint 规范
```

## Publish chain (W5-B1)

The topbar「发布」button rides `POST /flow-graph/publish` with `base_version` on the
same CAS counter as save (a concurrent save/publish pair lands exactly one winner).
The server first runs the round-trip equivalence gate (live rows → rowsToGraph →
recompile → row-by-row compare; any drift refuses the publish), then the publish
gates (orphans/endpoints/cycles/reachability/condition DSL/field vocabulary/the
engine-consumable feature matrix), and finally rewrites the derived rows in ONE
data-modifying-CTE statement (a lost CAS no-ops every arm). Success shows the
derived stats (N states / M transitions); failure lists every readable error. The
topbar Tag shows the published version and time (`published_graph_version` /
`published_at`), and each publish snapshots the prior rows into `config_note`
(the rollback anchor). Publishable in B1: assignees = named users / roles
(snapshot at publish), or-sign-off, empty policy = auto-reject / transfer-admin;
supervisorChain/formField/deptLeader/sequential/countersign/other empty policies/
multi-row conditions and other operators are B2 (readable 400s). Evidence script:
`examples/kb-agent/scripts/w5b1-publish.mts --selftest|--round-trip|--run`.

## Token source (strict mode)

The serve-side `/designer`, `/designer/*`, `/designer/meta`, `/flow-graph` routes reuse the W3 terminal `W3_TERMINAL_TOKEN` guard (`checkTerminalToken`). The designer shares one bootstrap pattern with the W3 terminal pages (`scripts/w3-terminals/`) ([`src/lib/auth.ts`](src/lib/auth.ts)):

1. **URL**: `/designer?token=<W3_TERMINAL_TOKEN>` — remembered on first visit;
2. **localStorage**: `w3-terminal-token` (same key as the W3 terminal pages — one injection serves every surface; in private mode just keep the URL parameter on every visit);
3. **Settings**: no separate settings entry — a fresh URL parameter overrides the remembered token.

Every SPA fetch carries the `x-terminal-token` header automatically; `designer.js` and `designer.css` sit behind the same guard — the inline bootstrap in `dist/index.html` injects the bundle `src` from the remembered token, and once the bundle loads ([`src/lib/auth.ts`](src/lib/auth.ts)) it appends `?token=` to `<link>`s. With `W3_TERMINAL_TOKEN` unset the serve runs the lenient local-demo mode (marked by the `x-terminal-auth: lenient-demo` response header; production must set the env). A missing token answers 401 with guidance: pass header `x-terminal-token`, query `?token=`, or inject once via URL `?token=` for localStorage to reuse.

## Editing-state persistence contract

- `GET /flow-graph?doc_type=` → `{ graph, graph_version }`;
- `POST /flow-graph` body `{ doc_type, graph, base_version }`: `base_version` is the `graph_version` this edit started from. The save commits through one atomic conditional UPDATE over psql (`WHERE id AND doc_type AND graph_version = base_version`; NocoBase's REST filter update is a find→update pair and cannot be the CAS primitive); a stale base moves zero rows and answers **409** (someone else saved — reload and redo), so two same-instant saves land exactly one winner (200) and one loser (409). Switching or reloading the doc type aborts the SPA's in-flight save, and a save response that returns after the canvas has moved on never writes state back. The serve logs the success (`v→v+1`), the conflict (both versions), and any unexpected failure with a stack;
- `validateFlowGraph` editing-state checks: negative or non-finite (Infinity/NaN) coordinates, titles that are blank after trimming, over 64 chars, or containing `<`/`>`, and approval nodes with empty assignees are all 400 refusals; persisted titles are stored trimmed;
- `GET /designer/meta` resolves every label through `resolveI18nTitle` — a NocoBase `{{t("...")}}` template title never leaks into a dropdown (the inner string shows; an empty department title drops the row).
