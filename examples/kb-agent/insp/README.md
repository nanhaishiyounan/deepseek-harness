# kb-agent-insp-workbench

English | [中文](README.zh.md)

W6-B5 QMS inspection workbench: the inspector-facing workbench over the existing qm_* spine — a vanilla touch-first SPA (`src/main.ts`, committed `dist/insp.js` served at `http://127.0.0.1:13110/insp`) and the server leg (`src/server.ts` — the engine's `/insp/*` handlers). The queue groups pending inspections by source (IQC/IPQC/OQC + a 48h overdue highlight); the wizard card walks lot size → AQL rung → the sampling plan looked up from the W2 `qm_aql_plans` 15-band seed (never a re-typed table) → per-item readings with the double-tap out-of-tolerance confirm and an on-site photo → the live verdict badge → the idempotent submit (a `submit_key` CAS on `qm_inspections`) → the four-way NC disposal (return/concession/rework/scrap, riding the W2 `createNc`/`disposeNc` engine verbs). The nine-element factory report (沪市监食监〔2025〕195号: product/spec/quantity/lot/production date/shelf life/basis/conclusion/reporter/reviewer) assembles from the inspection + readings + product + lot with explicit 「未维护」 placeholders, issues once (`qm_factory_reports`, report_no = the 检验合格证号), and prints to PDF. Writes are fenced to 质检部+admin with the session-derived actor; a failed verdict lands the sixth alert rule `inspection_fail`.

```sh
node esbuild.mjs                    # rebuild dist/insp.js (committed — a fresh checkout serves without a build step)
node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --seed    # fields + collection + rule + pages + rehearsal rows
node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --assert  # the acceptance matrix (15-band reconciliation included)
node demos/acceptance-w6/w6-b5-shoot.mjs                                # the CDP end-to-end + negative evidence
```
