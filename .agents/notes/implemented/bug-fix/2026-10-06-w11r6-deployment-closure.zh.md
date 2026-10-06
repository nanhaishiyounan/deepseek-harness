# Agent Note: W11-R6 终修收口——叙述闸自触的转述改稿、ui-mobile lib 部署链补跑、活体 100 键清扫复测

Status: implemented

[English](2026-10-06-w11r6-deployment-closure.md) | 中文

## 问题

W11-R5 终验收口 FAIL 84，登记 3 条半小时级收口债；R6 全部清偿，另带 2 条顺手项：

- **R5 节的自述句把禁词原文引了回来**。转述闸首跑所抓内容时，INDEX 那一行包含了被禁的归因措辞本身，闸自己的 absent 检查对已提交工作树失败——6/6 的 log 录于该叙述写入之前，从此不再描述它所在的树。
- **R5 源码没到部署面**。R5 改了 ui-mobile 源码（hoistToast 锚、快照式清扫）但没跑 `build:lib:client`，apps/web 的 bare import 一直解析到 R5 前的 `lib/`——3080 服务的 bundle 里 hoistToast 零命中，R5 的行为在活体上无从验证。
- **两条顺手项**：`vfy-w11r4-spec-full.log` 一直 untracked；`count-ui-mobile-tests.mjs` 打印失败但退出码恒 0。

## 决策

- **引述改转述**——禁词短语换成「旧归因措辞」——闸对已提交树重跑 6/6 且 EXIT=0（`w11-r5-narrative-check.log` 重录）。w11r5 note（中英）补 R6 补录时序，使其 6/6 声明对它所在的树为真。顺序固定（lesson 11）：改稿→跑闸→录 log→commit。
- **部署链端到端重建**：`pnpm run build:lib:client`（EXIT=0；`lib/index.js` mtime 14:34:21，grep hoistToast = 8）再 apps/web `vite build`（dist mtime 14:34:46，bundle `mobile-CRpPj6AV.js`）。minifier 会在 served bundle 里改 helper 名，锚以行为证明而非名字：`.verify-w11r6.mjs` 在 3080 上 7/7（三族清扫清掉全部会话键且 theme 存活、`session-keys.swept` 留痕 count=3、hoistToast 批失败 Toast 骑 lift 锚 computed bottom 150px、clearance 25px）。真实 Chromium Storage 上的 100 键种入——三族前缀各 20 共 60 会话键 + 40 无关键——清扫零漏删、40 个 byte-identical 存活（`w11-r6-sweep-100keys.log`，4/4）。
- **count 脚本现在会让调用方失败**：尾部 `process.exitCode = failed ? 1 : 0`。
- 两处探针适配（复现工具，非产品面）：登出确认点击弃 `force`——force 派发的事件在本构建上到不了 Dialog 按钮的 React handler，入场动画稳定后的 R3 无 force 形态即稳；100 键布局断言改精确种入清单——shell 自身的运行期键（auth、work 投影、其 outbox）住在同一 storage，且 outbox store 在走向登出的路上合法地把空队列写回，swept 的诚实计数因此是 61、每个种入键都在其中。

## 后果

ui-mobile 惯例口径 757/757（无新增——R6 不改源码行为）、`tsc -b tsconfig.client.json` 绿。叙述闸的 log 现在描述它所在的树；活体面在重建的部署链上证明了 R5 的两个行为变更（单一 Toast 锚、快照式清扫）。

## 备选方案

- **不改措辞只重录 log**——闸 grep 的是工作树，任何引述禁词的叙述都会在每次重跑时再失败；转述是唯一稳定形态。
- **把 swept 留痕钉死为恰好 60**——outbox store 的运行期回写让 61 成为诚实计数；零漏删的契约是「每个种入的会话键都在 swept 名单里」，断言现在说的正是这条。
