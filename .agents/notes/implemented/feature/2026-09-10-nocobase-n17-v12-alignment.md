# Agent Note: NocoBase N17 v12-demo alignment — v2 table pages, app hub, platform zh-CN

Status: implemented

English | [中文](2026-09-10-nocobase-n17-v12-alignment.zh.md)

## Problem

The admin business pages rendered as "builder pages" (drag handles everywhere), there was no multi-app entry like the v12 demo's `/settings/multi-portal`, the AI floating ball only existed on the AI workbench, and the platform plus both portals answered in English. The user asked for the v12 demo experience on the 2.2.6 OSS snapshot.

## Alternatives considered

- Keep the v1 pages and hand-inject an "AI" button into each page header — rejected: 1.x has no ChatBox component to open, and any link-out loses the in-context conversation the official ball provides.
- Rebuild only the CRM customer page as v2 — rejected: the user's bar was "every table page next to Add new", and the popup-form wire generalizes across collections once dumped.
- Wait for locale templates per employee (the form-assistant template ships en/zh) — rejected: the nine built-in employees have no zh-CN branch in code; `about` is the single runtime prompt source, so row upserts are the faithful mechanism.

## Decision

1. The "builder page" look was the browser-local `NOCOBASE_MAIN_DESIGNABLE` UI-editor switch, not a server defect — business pages were always reachable from the nine menu groups; usage guidance is the fix, plus screenshots with the switch off.
2. The v12 "AI employee next to Add new" is the plugin-ai ChatButton floating ball (bottom-right), which 2.2.6 renders only on non-v1 pages whose pathname starts with `/admin`. Upgrading the eight core table pages to v2 flowPages is therefore the official-same-shape path: table + official Add-new/Refresh action bar + popup form (wire dumped from a hand-built sample: ChildPageModel → ChildPageTabModel → BlockGridModel → CreateFormModel → FormGridModel → FormItemModel + edit field model, plus a bare FormSubmitActionModel) + the floating ball for free.
3. multi-portal is commercial-only in OSS 2.2.6 (the preset boundary test asserts the plugin's absence); the 「应用中心」 Markdown card page linking both portals, the AI workbench, and DSH is the accepted equivalent.
4. zh-CN must be written into both the `systemSettings` top-level column (portal-sdk reads it) and `options.enabledLanguages` (the admin app reads it) — one layer alone leaves either surface English. Built-in AI employee copy lives in `about` rows (null falls back to English code defaults), so the Chinese prompts are row upserts keyed by username.
5. `flowModels:list` omits `parentId` (only `findOne` carries it): idempotency must not key on parent links from list rows — deterministic child uids (`n17sb-<formUid>`) instead. And v1 block replays must skip titles whose desktopRoutes row became a `flowPage`, or `getJsonSchema` finds no Grid and the `all` chain breaks on replay.

## Consequences

`nocobase-n17-alignment.mts` joins the `all` chain fully idempotent; `verify` carries six N17 assertions (both locale layers, app hub, eight v2 flowPages, AddNew/FormSubmit model floors, atlas Chinese prompt). Evidence: `examples/kb-agent/demos/nocobase-full-features/N17-01..07-*.png`. Remaining gaps are deliberate: Add-new forms cover input/select/number fields (date/m2o edit models not yet dumped); v12's AI-mode git-source portals and "Connect coding agent" stay out of scope for OSS.
