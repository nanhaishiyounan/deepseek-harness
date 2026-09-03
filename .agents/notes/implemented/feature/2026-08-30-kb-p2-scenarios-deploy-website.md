# Agent Note: P2 scenario set, private deployment, and the website mapping

Status: implemented

English | [中文](2026-08-30-kb-p2-scenarios-deploy-website.zh.md)

## Problem

P2-2 rolls the product out: a scenario framework scaling toward the plan's 30 scenarios, a single-tenant private-deployment guide with no new infrastructure, and the ftd.lzqz.cn-shaped operations-site integration ([`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md), P2 §2/§4/§5).

## Decision

- **A scenario is a directory contract, not code**: `preset.yml` (display metadata + a `probe` query the corpus is guaranteed to answer) + `agent.cordis.yml` (the same thin persona + scoped tool-kb shape as the shipped presets) + `SKILL.md` (when to retrieve, citation format, when to use the graph tools) + `data/corpus.md` (desensitized scenario corpus). Adding a scenario is content-only: copy a directory, rewrite four files — the set snapshot (`tests/scenarios.spec.ts`) picks it up automatically (structure, real-Loader mount, retrieval-only surface, cited retrieval of its own corpus).
- **11 scenarios shipped, covering all 8 categories** (the meeting minutes' five demand categories plus the research report's export/equipment/data-asset classes); the remaining 19 toward the 30 target are named in `scenarios/README.md` as pure content fills. One snapshot covers the whole set — per-scenario snapshot files would repeat the plan's own cost-warning (risk #7).
- **Deployment adds no infrastructure** (`DEPLOY.md`): systemd unit, one SQLite file (WAL backup notes), `.env` with the single MiniMax key, `DSH_HOME` redirection, fail-loud schema-ownership on upgrade. One deployment = one tenant; the retrieval-only tool disabling is documented as a composition fact reviewers can see in the patch.
- **The website integration is a mapping document, not an API** (`WEBSITE.md`): the plan's P2 §5 wording makes the operations site an independent frontend driving the harness through the dsh SDK (JSON-RPC/ACP) — so the deliverable maps each site capability (registration/subscription/credits/storage hook/citation) to its existing repository landing point (tenant binding, presets, `ctx.kb.usage`, the workbench panel, numbered citations) and names the SDK as the only contract. No private endpoint was added for it.

## Alternatives considered

- **A scenario generator script** — rejected: four small files per scenario are cheaper to review than generated output; the snapshot is the invariant.
- **Docker in the deployment guide** — rejected: the plan's constraint is no new infrastructure; systemd + Node covers the single-tenant case. Docker remains available to the operator without our blessing it here.
- **A read-only BFF endpoint for the website** — rejected: the plan's entry names the SDK as the channel; the gateway `kb.*` domain already serves authenticated clients, and a CORS-open stats endpoint would be a new attack surface for no mapped capability.

## Consequences

- The scenario snapshot is the gate every future scenario inherits for free; the two shipped role presets double as scenarios (listed in the README's fill list).
- Deployment, backup, and upgrade behavior live in one bilingual guide a field engineer can follow verbatim.
- The website mapping gives the business side a stable story (free tier → role subscription → data-asset services) with each claim pointing at shipped mechanism.
- Known gap: 19 of 30 scenarios remain content fills; the framework and snapshot are the deliverable that makes them cheap.
