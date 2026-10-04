# kb-agent-label-print

English | [中文](README.zh.md)

W6-B3 food-compliance label printing: a zero-dependency Code128/GS1-128 encoder-decoder (`src/code128.ts` — the same module approval-engine.mts serves `/label/lot.svg` from and the acceptance round-trip decodes), a vanilla print SPA (`src/main.ts`, committed `dist/labels.js` served at `http://127.0.0.1:13110/labels`), and the server leg (`src/server.ts` — the engine's `/label/lots.json` and `/label/lot.svg` handlers). The GS1-128 label carries the legal minimum four AIs (01 GTIN-14 / 10 batch / 11 production / 17 expiry — Food-Safety-Law articles 50/51) with the human lines batch / product / dates / supplier. Printing is `window.print` over the `@media print` sheet.

```sh
node esbuild.mjs                    # rebuild dist/labels.js (committed — a fresh checkout serves without a build step)
node --import tsx/esm examples/kb-agent/scripts/w6b3-labels-assert.mts   # the scanner round-trip assertions
```
