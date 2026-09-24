# B1 · 设计令牌双轨替换 + 全局壳/TabBar 重排

> **子任务必载技能**：`high-end-visual-design`、`frontend-design`（全局）。涉及 antd-mobile TabBar/SafeArea 覆写，加 `ui-ux-pro-max`。
> **前置**：阅读 [../PLAN.md](../PLAN.md) §1-§2 与设计稿 `/Users/mac/Downloads/index (5).html` 第 8-45 行（令牌）、298-308 行（tabbar/桌面壳）。

## 范围

令牌换血 + 壳层结构（TabBar 重排、转场时长、430px 桌面形态、PC 预览壳）。**不改任何视图内部布局**（B2/B3 负责）——本批结束时所有页面已换新色系但版式仍 v5，这是预期中间态。

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/client/ui-mobile/src/client/tokens.css` | 双轨整轨替换（下表色值）+ 结构令牌微调 + 保留 `--adm-*` 挂接与 `.dshm-root` 基座属性 |
| `packages/client/ui-mobile/src/client/shell/MobileShell.tsx` | `TAB_ROUTES` 改 `['home','agents','work','me']`；TabBar 四项改「消息/同事/工作台/我的」+ lucide 图标替换（MessageSquare/Users/LayoutGrid/User，size 20） |
| `packages/client/ui-mobile/src/client/shell/shell.module.css` | tabbar 58px + safe-area、tab 字号 10.5/粗 600、active=brand、图标 22px 视觉档 |
| `packages/client/ui-mobile/src/client/shell/transitions.css` | fade/slide 时长对齐设计稿（`pageIn .22s ease`）；`prefers-reduced-motion` 降级保留 |
| `packages/client/ui-mobile/src/client/App.tsx` | 仅当需要：`.dshm-root` 容器 max-width 430 居中 + 桌面(@media ≥720px) 圆角 24px 手机壳形态（或放到 shell.module.css，二选一，保持一处） |
| `packages/client/ui-mobile-preview/src/client/MobilePreviewView.tsx` | 预览壳视口 390×844 → 430×自适应（对齐设计稿桌面形态），iframe 边框圆角 |
| `packages/client/ui-mobile/tests/`（shell 相关 spec） | Tab 标签/白名单断言同步（grep `TAB_ROUTES`、`AI同事`、`chats` 触面） |
| `apps/web/tests/mobile-shell.e2e.ts` | 4 Tab 断言改为新顺序/新标签；`chats` 用例改为全屏层断言（返回头存在、无 tabbar） |
| `apps/web/tests/snapshots/…` | 受影响 golden 重录（`pnpm run test:web:refresh -- mobile-shell`） |
| `packages/client/ui-mobile/README.zh.md` + `README.md` | 视觉代际说明（v6 蓝色系「AI 同事」设计稿落地）+ Tab IA 变更，双语同步 |

## 令牌映射表（tokens.css 亮轨 → 暗轨）

设计稿 `:root`（1-20 行）/ `[data-theme="dark"]`（21-28 行）逐值映射到 `--dshm-*` 命名（保留现有令牌名，值换血；引用型令牌不动自动跟随）：

| 令牌 | 亮轨（设计稿值） | 暗轨（设计稿值） |
|---|---|---|
| `--dshm-primary` | `#2E7CF6`（brand） | `#2E7CF6`（设计稿暗轨未单独给 brand，保持一致；on-primary 仍 `#fff`） |
| `--dshm-primary-soft` | `#EAF2FF`（brand-soft） | `#1B2C4A` |
| `--dshm-primary-10` | `rgba(46,124,246,.10)` | `rgba(46,124,246,.16)` |
| `--dshm-foreground` | `#18202F`（text） | `#E8ECF4` |
| `--dshm-muted-foreground` | `#758199`（sub） | `#8C96AA` |
| `--dshm-background` | `#F2F5F9`（bg） | `#0E131B` |
| `--dshm-card` | `#FFFFFF`（card） | `#1A212D` |
| `--dshm-muted` | `#F7F9FD`（card2，fold zones） | `#151B26` |
| `--dshm-border` | `#E8EDF4`（line） | `#252E3E` |
| `--dshm-success` | `#18A058`（ok） | `#18A058`（暗轨可微调亮度至 ≥4.5:1 对比度，同 v5 B3 暗轨抬升先例） |
| `--dshm-warning` | `#F59E0B`（warn） | 暗轨适度抬升（同上） |
| `--dshm-destructive` | `#E5484D`（danger） | 暗轨适度抬升 |
| `--dshm-bubble-user-bg` | **新增** `--dshm-user-grad: linear-gradient(135deg,#2E7CF6,#22B8E8)`；`--dshm-bubble-user-bg` 保留纯色 `#2E7CF6` 兜底（渐变用于气泡/发送钮/hero，见 B3） | 同（渐变双轨一致） |
| `--dshm-bubble-ai-bg` | `#FFFFFF` | `#1A212D` |
| `--dshm-bubble-ai-border` | `#E8EDF4` | `#252E3E` |
| `--dshm-radius` / `-lg` / `-bubble` | `10px` / `16px`（radius）/ `16px` | 同 |
| `--dshm-tabbar-height` | `58px` | 同 |
| `--dshm-shadow-card` | `0 6px 24px rgba(23,43,77,.07)` | `0 6px 24px rgba(0,0,0,.4)` |
| `--dshm-font-sans` | `-apple-system,BlinkMacSystemFont,'PingFang SC','HarmonyOS Sans SC','Noto Sans SC','Microsoft YaHei',sans-serif` | 同 |
| `--dshm-brand2`（新增） | `#22B8E8`（会议中状态、渐变副色） | 同 |

处理规则：
- **温度层三色 `--dshm-temp-*`、工作四态 `--dshm-work-*`（引用型）、stamp/motion/touch 令牌保留**；work 四态引用 primary/warning/success/muted-foreground，自动换血。
- `--adm-*` 挂接块（72-85 行）原样保留（var 引用自动跟轨）。
- 文件头注释重写：v6「AI 同事」设计稿令牌代际（引用本计划）。

## 实施步骤

1. 替换 `tokens.css` 双轨（上表）；`pnpm vitest run packages/client/ui-mobile` 跑红名单。
2. 改 `MobileShell.tsx` TabBar（TAB_ROUTES + 四 Item 标签/图标）；修对应 spec。
3. `shell.module.css` tabbar 视觉档 + App/shell 430px 桌面壳；`transitions.css` 时长。
4. `ui-mobile-preview` 壳 430px；跑 `pnpm run build` 确认产物。
5. 更新 `mobile-shell.e2e.ts` + 重录 golden；README 双语。
6. 起服务截图（下节）。

## 验收标准

- [ ] `pnpm vitest run packages/client/ui-mobile` 全绿（覆盖门禁不破）。
- [ ] typecheck + oxlint 过；`pnpm run build` 过。
- [ ] `pnpm run test:web -- mobile-shell` / `mobile-preview-iframe` 过（golden 已重录）。
- [ ] 截图对账（`research/2026-09-23-mobile-v6-uidesign/b1-*.png`）：①`b1-01-tabs-light` ②`b1-02-tabs-dark` ③`b1-03-chats-layer`（chats 全屏层带返回头、无 tabbar）④`b1-04-preview-430`（PC 预览壳）。核对点：tabbar 高 58、active #2E7CF6、图标线性 20-22px；暗轨 bg #0E131B / card #1A212D。
- [ ] `grep -rn "0b5d56\|e3eeec" packages/client/ui-mobile/src` 零命中（旧色系清干净；测试快照中的旧色同步重生成）。
- [ ] Agent Note 已附；README 双语已更新。

## 风险与回滚

- **全局单点**：tokens.css 一处 revert 即恢复 v5 冷链色系（14 个 module.css 的 var 引用不受影响）。
- Tab 重排动了 e2e 合同：revert `MobileShell.tsx` + `mobile-shell.e2e.ts` + golden 三件即回。
- 暗轨语义色对比度：若截图目检不足 4.5:1，按 v5 B3 先例抬升（记录进 tokens.css 注释），不回滚整轨。
