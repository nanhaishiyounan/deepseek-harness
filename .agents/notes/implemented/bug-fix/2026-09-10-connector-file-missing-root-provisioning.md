# Agent Note: connector-file missing root — provision at load, degrade to empty at discover

Status: implemented

English | [中文](2026-09-10-connector-file-missing-root-provisioning.zh.md)

## Problem

Opening the workbench's data-asset tab on a clean checkout failed the whole market with `ENOENT: scandir .../workspace/data/connector-files` ("市场暂不可用"). Three gaps stacked: no code or setup step ever created the directory, git cannot carry an empty whitelisted directory (`.gitignore` allowed `!workspace/data/connector-files/` but nothing tracked lived inside), and the provider's fail-loud contract amplified one absent drop-in directory into a 500 that hid the other 174+ NocoBase-backed assets. The QUICKSTART's only answer was a manual `mkdir -p` step whose own FAQ predicted the crash on first boot.

## Decision

### ENOENT at load provisions the root; every other errno still fails the composition

`apply()` catches only `ENOENT` from its load-time `readdir` and recreates the root with `mkdir(root, { recursive: true })`; `ENOTDIR` (a regular file occupies the path), `EACCES`, and everything else still fail composition load loud. The judgment: an absent directory is the legitimate not-yet-provisioned first boot of a deployment — "misconfiguration fails loud" never meant "an empty drop-in directory is a configuration error".

### ENOENT at discover answers an empty dataset, not an error

A root deleted while the composition keeps running makes `discover()` return `[]` — again swallowing only `ENOENT`, rethrowing the rest. This deliberately decouples the runtime's fail-fast fan-out (any provider error fails the whole `connector.discover` call) from the file provider's honest answer for an empty file set: a wiped drop-in directory should cost the market one asset kind, not the whole page. `available()` stays a constant `true`.

### The directory ships populated: three git-tracked sample files

`.gitignore`'s existing whitelist now carries weight: `sample-supplier-prices.csv`, `sample-export-compliance.md`, and `sample-shipment-events.json` (food-industry context, `sample-` prefix marking demo intent) make a clone land with the directory present and discoverable file assets inside. The plugin-level auto-provision remains as the runtime backstop for mid-run deletion and for deployments whose checkout predates the files. Setup-chain `ensure` stays out of this fix by design — batch B2's `setup-dsh-data` orchestration owns it.

### Stale `src/*.js` build outputs hijacked the e2e lane and were deleted for this package

Commit 57a87db34c had committed `src/index.js`, `src/provider.js`, and their maps alongside the TypeScript sources. Under vitest's tsconfig-paths resolution, vite resolves the extensionless workspace path with `.js` ahead of `.ts`, so the market e2e lane silently ran the stale JavaScript while unit tests imported `../src/index.ts` directly and passed. The mismatch surfaced only when source and artifact diverged (this fix). The five artifact files are deleted from this package; the same pattern in `app-boot`, `cmdline`, `test-support/*`, and `launch-environment` is pre-existing, currently in sync, and untouched here.

## Alternatives considered

**Failing loud on ENOENT as before, adding only a setup-chain mkdir.** That keeps the crash for every path the setup chain does not own (fresh example compositions, `kg-build.mts`, hand-rolled cordis.yml) and re-derives the same QUICKSTART manual step for anyone outside the example.

**Swallowing every readdir error into an empty list.** An occupied or unreadable root would then silently masquerade as an empty market — exactly the silent-skip failure mode AGENTS.md forbids; errno discrimination is the whole decision.

**Making the e2e case delete the directory before page load instead of reloading.** The sidebar entry preloads the shared stats/catalog caches at page load, and `MarketView` refreshes only when `stats === undefined`; without the reload the tab renders the pre-delete snapshot and the assertion tests the cache, not the wiped root.

## Consequences

A clean world with the directory absent boots to a working market (verified live: 数据产品 174 · 供方 2, catalog 174/174, no error strip, zero console errors); with the sample files restored the same page counts 177 and lists all three. Unit tests pin all three paths — load-time provisioning, ENOTDIR fail-loud, discover-time empty list — and the new market e2e case locks the wiped-root degradation through the real Chromium lane. QUICKSTART drops the manual `mkdir` step and its crash FAQ; the connector-file README (both languages) documents the provisioned/degraded contract. The trade-off bought: an operator pointing `root` at a not-yet-created path gets an empty directory created for them (a write at load time), and anyone reading the market must remember that file-kind assets can legitimately be absent while every other kind keeps working.
