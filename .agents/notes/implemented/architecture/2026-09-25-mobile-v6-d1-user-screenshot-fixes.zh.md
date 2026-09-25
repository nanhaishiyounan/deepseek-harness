# Agent Note：移动端 v6 D1——用户截图诊断修复批

状态：已实现

[English](2026-09-25-mobile-v6-d1-user-screenshot-fixes.md) | 中文

## 问题

用户发来两张实机截图（「你自己看看，丑的」）：智能填表助手会话页叠加创建任务弹层、以及首页 Tab。视觉模型目检加上对 `:3080` 的 computed-style 探针（证据：`research/2026-09-24-mobile-v6-audit/USER-SCREENSHOT-DIAGNOSIS.md`）确认十六个缺陷。弹层混用两套字段语言（盒式标题输入框 + 下划线式选择行）；截止时间的清除 X 以 span 嵌在值区内、与箭头同用 primary 色；弹层无视口上限——真实手机 Safari 视口（约 650px）下按钮组被推出屏外，「创建任务」不可达；来源条把 AI 建议全文重复进自己；建议块与来源条视觉同权。首页侧：38 位同事 6–9 字名对 64px 单行全部截成省略号；快捷入口四枚胶囊宽窄不齐且 375px 折行；statsCard/recentList 无阴影而 work 域卡片全有，卡片体系割裂。

## 决策

- **弹层 = 固定底栏的 bottom sheet（对齐 NewChatSheet 模式）。** `.sheetBody` 以 `calc(100dvh - 76px)` 封顶；sheet 改为 head / `.sheetScroller`（overflow-y auto + overscroll contain）/ `.sheetActions` 的 flex 列，取消/创建按钮组在任意视口都钉在安全区上方，不再被推出屏幕。
- **单一字段语言。** `.pickerRow` 采用标题输入框的盒式面（1px 边框、10px 圆角、44px 高、12px 内边距、muted 按压态），三行表单读作同一种控件；箭头降为 `--dshm-muted-foreground`（chrome 而非值）；截止时间清除钮独立为 `.pickerClear` 的 muted 命中圆（span-role button——它嵌在行按钮内，不能是原生 button）。
- **信息去重。** 来源条只留来源标题（两行钳制）；建议文本只活在建议块里，块体采用工作详情的 quote 语言（muted 底 + 3px 品牌左条）与 primary-10 来源条分离。
- **首页节奏。** 同事名两行居中钳制在 76px 卡上（38 名全部完整渲染）；快捷入口改 `repeat(4, 1fr)` 网格恒一行恒等宽；statsCard/recentList/recentSkelGroup 补 `--dshm-shadow-card` 对齐全站卡片；台账网格以实色 border 令牌分列、数字升至 22px、标签转 muted；最近对话行采用会话层的 64px + 发丝分隔语言；未读点降至 8px；同事横滑栏右缘渐隐加宽到 26px。

## 备选方案

- 数字未读徽章（设计稿 `.conv-badge`）被否：draftStore 水位是布尔量，造计数即是造假数据。
- 台账列分隔或卡片阴影加深超过 `--dshm-border` / `--dshm-shadow-card` 被否：发丝线族与 0.07 光晕是跨页体系，单页自加深会分叉卡片语言。
- 同事名按词断行（`word-break: keep-all`）被否：无空格 CJK 名会溢出进钳制而不是换行，把正常词中换行换成更糟的切断。

## 后果

- `pnpm vitest run packages/client/ui-mobile` 613 测试全绿（弹层结构变更不触碰 picker/date portal 嵌套）；仓库 typecheck、lint（0/0）、build（220 产物）保持全绿；`mobile-assistant.e2e` 通过。snapshot 套件 5 文件红与 kb-agent/NocoBase e2e 红为预存基线（干净 HEAD stash 复跑同样复现），本批未触碰。
- `:3080` dev server 从构建产物服务 ui-mobile，视觉改动必须先 `pnpm run build` 再复拍——03:19 存档（`d1-fix-2~5`）早于列分隔令牌的最后一次替换，由重建后的 `d1-fix-1-home.png` + `.d1-home-reshoot-evidence.json` 补证。
- 原服务（PID 51859）在最终复拍前随终端会话死亡（与本批无关）；以相同命令重启为 PID 63453，当日内存态演示会话随之而去——用户截图的会话态只在服务进程存活期内可复现。
- 截图证据：`research/2026-09-24-mobile-v6-audit/`——`d1-user-1~4`（修复前）、`d1-fix-1-home / 2-chat / 3-taskform / 4-taskform-small / 5-taskform-dark`（修复后），探针在 `.d1-user-evidence.json` / `.d1-fix-evidence.json`。
