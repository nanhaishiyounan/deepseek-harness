# Agent Note: W12 — template starter skeletons and the QUICKSTART eight-role account table

Status: implemented

English | [中文](2026-10-06-w12-tag-template-starters.zh.md)

## Problem

- The user's original ask for the starter tags read "a preset tag must not carry a concrete transaction; it assists input, and the concrete question is the user's to edit and send." W9-B1 delivered the assist-input half (a pick fills the draft, focuses the box, parks the caret, sends nothing) but the deployment's starter copy kept the concrete half: of the six `mobile-form-assistant` starters in `examples/kb-agent/agent-presets/mobile-form-assistant/preset.yml`, three were full concrete sentences — a purchase line naming supplier/material/quantity/unit-price, the inventory line that was the user's original complaint verbatim, and a supplier-registration line naming one real supplier. A live DOM probe confirmed 3 of 6 tags prefilled a concrete transaction.
- `examples/kb-agent/QUICKSTART.zh.md` line 336 pointed readers to "八角色见「换角色」节" for the mobile business accounts, but that section named no accounts at all — a dead pointer for anyone trying to sign in on `/mobile`.

## Decision

- **The three concrete sentences became placeholder skeletons** — `向【供应商】采购【物料】，数量【数量】，单价【单价】`, `查一下【物料名】还有多少库存`, `给供应商【供应商名】登个档` — keeping each tag's business intent one tap away while leaving explicit blanks. Both copies changed together: the git-tracked `agent-presets/` source and the `examples/kb-agent/.dsh/.agent-presets/` runtime copy the live gateway serves (the preset welcome is read through `agentPreset.list`, which re-reads disk, so no gateway restart was needed).
- **`fillDraft`'s focus pass learned the placeholder span** (`ChatView.tsx`): after the picked text commits, `TEMPLATE_PLACEHOLDER = /【[^【】]*】/u` probes the box; a hit selects the first `【…】` span including both brackets via `setSelectionRange`, so the user's typing replaces the whole span and leaves no bracket residue; no hit keeps the W9-B1 end-of-text caret. The span is selected whole rather than only its inner text for exactly that reason — selecting `物料名` inside the brackets would strand `【` and `】` around whatever the user typed.
- **The fixture** (`views.client.spec.tsx`) rides the wire path a real deployment takes: `agentPreset.list` stubs a preset whose `welcome.starters` carry the three edited shapes, and the case asserts the multi-placeholder skeleton fills with `【供应商】` selected (1..6), the single-placeholder skeleton with `【物料名】` selected (3..8), the placeholder-free pick keeps the end caret, and no `session.prompt` call leaves the page.
- **The QUICKSTART「换角色」section now carries the eight-role table** — username, password, name·department, and role surface for buyer/planner/shop_lead/keeper/qc_inspector/sales_rep/finance/admin, plus the note that the NocoBase platform backend uses `nocobase/admin123`. The data is the seed's own (`scripts/w5b8-closure.mts`, idempotent reseed); rehearsal passwords in plain text follow the W5-B8 precedent. `QUICKSTART.zh.md` is a zh-only file registered in no i18n pairing manifest, so no translation pairing obligation fires.

## Consequences

- ui-mobile 758/758 (one new test), `pnpm run typecheck` green, `build:lib:client` + apps/web `vite build` rerun, and the live :3080 face passes 9/9 in the probe (`.shoot-w12-tag.mjs`): both template tags fill their skeleton with the first span selected, focus lands, no user bubble appears, and the placeholder-free tag keeps the end caret. Evidence PNGs: `w12-tag-template-inventory-375.png` / `w12-tag-template-purchase-375.png` (both shot with a one-off probe-side height unwrap so the whole skeleton and the native selection highlight render inside the 375px viewport) and `w12-tag-template-natural-375.png` (the untouched capsule).
- A display fact this batch did not change: the W11-B1 composer is a single-line 46px capsule, so a 14-character skeleton overflows and the browser scrolls the selection into view — the same scrolling any long draft already had. The caret/selection contract is proven by DOM assertions; the unwrapped shots exist because the native highlight is otherwise cropped.

## Alternatives considered

- **Editing only the local fallback table** (`colleagues.ts` `registryStarters`) — pointless on the live face: the deployment's preset.yml welcome block wins over the local table wherever `agentPreset.list` carries one, and the local starters ("帮我登记一条X") already carry no concrete transaction.
- **Selecting only the span's inner text** — leaves the brackets behind after the user's replacement; the whole-span selection is the form that makes "edit, then send" one continuous gesture.
