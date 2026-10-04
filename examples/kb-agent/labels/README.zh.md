# kb-agent-label-print

[English](README.md) | 中文

W6-B3 食品合规条码打印：零依赖 Code128/GS1-128 编解码器（`src/code128.ts`——approval-engine.mts 的 `/label/lot.svg` 与验收回读断言共用同一模块）、vanilla 打印 SPA（`src/main.ts`，构建产物 `dist/labels.js` 已提交，由引擎 `http://127.0.0.1:13110/labels` 服务）、服务端腿（`src/server.ts`——引擎 `/label/lots.json` 与 `/label/lot.svg` 的实现）。GS1-128 标签承载法定最小四 AI（01 GTIN-14 / 10 批号 / 11 生产日期 / 17 到期日——食安法第 50/51 条），文本行含批号/品名/生产到期/供应商。打印走 `window.print` + `@media print`。

```sh
node esbuild.mjs                    # rebuild dist/labels.js (committed — a fresh checkout serves without a build step)
node --import tsx/esm examples/kb-agent/scripts/w6b3-labels-assert.mts   # the scanner round-trip assertions
```
