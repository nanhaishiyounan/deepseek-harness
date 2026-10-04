# Agent Note: W7-M1+M2 — mobile v7 四 Tab 重设计与空态/骨架统一体系

Status: implemented

[English](2026-10-04-w7-m1-m2-mobile-v7-tabs.md) | 中文

用户反馈：mobile 难看。2026-10-03 审计（04-mobile-aesthetic-findings）把四个 Tab 面定在蓝色单色系（home 品牌色字面 21 处、快捷 chips 全部 primary-soft 实底）、数字/标签 2:1 断崖、头像糖果色无色板逻辑；全屏层则是「会话加载中」单行占位压着 750px 空白，todos/docs/tasks/files 的空态全是一行灰字。

## Problem

M0 令牌基座落位后，四 Tab 面与九个全屏层仍跑在 v6 的版式语法上——蓝色单色系、12 档散布字号、零海拔卡片、空态/加载两极裸奔。

## Decision

M1——四个 Tab 面（`packages/client/ui-mobile/src/client/`）：

- home 减蓝：渐变 hero 撤下，换成白卡 + 唯一品牌点缀 `heroDate` primary-soft 日期胶囊；快捷 chips 只留一个实底主 CTA（登记一条单据），其余六个走中性卡面；两处「查看全部」链接降为 muted 色调；今日台账数字升到 26px `--dshm-fs-num` KPI 档并修复 0 叙事（0 灰、活跃计数保留 `--dshm-work-*` 态色）。home 品牌色字面计数 21 → 1（`rg 'dshm-primary|dshm-user-grad|dshm-brand' home/`），低于 ≤6 预算。
- 同事头像色板换成等色相距四深色（蓝 212°/青 177°/绿 122°/赭 28°）同一明度带、以品牌蓝锚定——替换 #2e7cf6/#4f6076/#3d5a80/#7a5c3e/#1c2b29 混色（`colleagues.ts`）。
- agents：分组标题提到 ink 档并加尾随 hairline 短规线；技能 pills 中性化；每个 roster 行尾加状态 chip + 展示箭头（补 60-80px 空置右缘）。
- work：空态 CTA 实底化（「去找 AI 同事」原是描边按钮却承载主操作）；CapsuleTabs 激活态改 primary-soft 填充（撤掉实底 vs 浅描边的双极端）；工具宫格图标块单色化（撤掉逐同事糖果色块）；每张工作卡加 `--dshm-work-*` 的 3px 状态脊条（STATUS_PALETTE mobile 面）。
- me：身份头像改纯色 primary（撤渐变）；快捷入口胶囊中性化；本月占位统一为「…」/「读取失败」/「N 条」。

M2——全屏层 + 一次性建成的空态/骨架组件（`ui.tsx` + `ui.module.css`）：

- `EmptyState`：图标块（muted 底 + 品色线性图标）+ 主文案 + 副文案 + 一个实底 CTA，附 `section` 变体给卡内条带。替换九处散装空态：todos（CTA→docs）、docs（CTA→agents）、alerts、tasks（CTA→chats）、work（CTA→agents）、files 三段、home 最近对话、chats（双文案：按筛选+关键词区分「还没有会话」vs「没有匹配的会话」，Fiori 规则）。
- 骨架与真实行结构对齐：`SkelRow` 补尾部时间戳占位；`SkelCard` 重构为印章头卡轮廓（todos/docs/alerts 加载态）；`SkelThread` 渲染聊天首屏气泡块，撤掉压空白流的「会话加载中…」单行。
- chat 几何统一到单一「新增」形状：composer 的 + 与顶栏 + 全部为圆形，顶栏 + 从实底品牌降为 brand-soft 面（44px 实心圆点在白头过跳）。
- login 输入框自带边界：muted 填充对白卡（v6 卡上卡填充不可见）。
- alerts 严重度分层改材质而非仅色相：critical 保留实底红印章，warning 降为 soft 琥珀 chip + 琥珀描边。
- M0 遗留清偿：module CSS 中 30 处裸 `999px` 全部引用 `--dshm-radius-pill`（token 随圆角阶梯新增）；所有 `var(--dshm-*, fallback)` 撤掉 radix 时代 fallback；九处旧蓝 `rgba(46,124,246,…)` 字面（chat 发送阴影、ask/starter 描边、welcome/chip 描边）收进新双轨 token `--dshm-primary-rim` 与 `--dshm-send-shadow`。

## 证据

- `demos/acceptance-w7/w7-m1-01..05-*.png`——四 Tab after（375×667，qc_inspector 真实登录）+ home 暗轨抽查；`w7-m2-06..16-*.png`——十一个全屏层面 + login + chats 暗轨。
- `demos/acceptance-w7/w7-m2-20..23-empty-*.png`——四个统一空态面（chats 无匹配关键词、tasks、files、todos）。`w7-m2-30..32-skel-*.png`——Playwright 路由延迟桩下截取的三个加载面（chats 行、chat 气泡流、todos 卡）。
- `.shoot-w7m.mjs` 的 probe 日志（硬数字，全绿）：Tab 标签 12px/600；heroCard 白 `rgb(255,255,255)` + 弥散影；statValue 26px SF Mono/600；卡 16px 圆角 + 海拔影；卡与画布 RGB 差 21.3%（≥8% 预算）；`xOverflow: 0`；home DOM 品牌实例 12（rg 字面计数 1——见遗留）。
- 替换后 `pnpm vitest run ui-mobile` 668/668；`tsc --noEmit` 干净；`build:lib:client` + `apps/web` vite build 绿，3080 服务重启（模块图冻结契约）。

## 重放中暴露的修复

- 两个 lucide 名在 vendored 版本不存在（`FolderStar`、`ChatCircle`），渲染成 undefined 元素类型——换成 `Star` 与 `MessageCircle`；校验法 `grep "declare const <Name>" node_modules/lucide-react/dist/lucide-react.d.ts`。
- 未读点第一版修复（2px 卡色描边）在白卡上不可见；落地版是双环——2px 卡色 rim + 3.5px destructive-10 光晕。
- chats 空态文案需要关键词分支：filter=all 且搜索无命中时曾显示「还没有会话」；条件现为 `filter === 'all' && keyword.trim() === ''`。

## 已知遗留

- home DOM 级品牌实例计数（12）初读超过 ≤6 预算，但分解为 heroDate 1 + 一处 doing 语义数字 1 + 登记主 CTA 1 + 三个品牌蓝同事头像（色板锚点）+ 激活 Tab 的四元素 DOM 展开（一个视觉面）；计划断言点名的 rg 字面计数为 1。若评审要求 DOM 计数也低于 6，M3 可把 doing 数字提到前景 ink。
- 预警行仍无时间戳：`AlertRow` 没有服务端时间字段，视觉层不虚构（daysLeft 承载时效）；给 wfl_alerts 投影加 `raised_at` 是 W8 候选。预警正文数值高亮与同 CCP 聚合同为数据层工作，不在 M2 视觉范围。
- work-detail after 落在空 tab（qc_inspector 名下无工作项）；详情面由 w6 gates 覆盖，M3 用持有工作的账号补拍。
- v6 welcome/ask ghost-chip 面（卡上 primary-rim）与暗轨 chats 空态本批未重拍；归 M3 暗轨批次。

## Alternatives considered

- 逐面一次性 CSS vs 字阶令牌——字阶让后续每个面都落在同五档上，M3 才能只加一个 tab-active 令牌而不动 module 文件。

## Consequences

- 五档字阶与海拔/边框令牌集就是 M3 暗轨走查的断言基准；后续新增面应读令牌而非硬编码 px。
