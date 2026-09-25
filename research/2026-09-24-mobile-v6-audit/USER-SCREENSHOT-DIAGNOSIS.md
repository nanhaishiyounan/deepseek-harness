# D1 用户截图诊断（USER-SCREENSHOT-DIAGNOSIS）

用户对 v6 移动端 UI 不满，发来两张实机截图（亮轨）称「丑的」。本文件是视觉诊断 + 代码归因 + 活服务复现三方对账的结论落盘；修复对照表见文末。

- 截图 A：`.roo/temp-images/image_1790304986214_qzw445.png`
- 截图 B：`.roo/temp-images/image_1790304986227_rousoo.png`
- 复现机位：`d1-user-1-home.png`（390×844 / B 同机位）、`d1-user-2-chat.png`、`d1-user-3-taskform.png`（A 同机位）、`d1-user-4-taskform-small.png`（375×667 小屏臂）
- 复现证据：`.d1-user-evidence.json`（computed style + rect 探针）
- 服务：PID 51859 @ :3080/mobile（只读）；登录态与用户截图一致（鲜丰冷链箱登记 09:54 / 采购入库单 02:18 / 你好 01:25 三条会话逐字吻合）

## 截图 A：表单会话页 + 「创建处理任务」弹层

### 画面定位

`#/chat/<mobile-form-assistant 会话>`（智能填表助手 · 鲜丰冷链箱登记），亮轨；前景为 `TaskFormModal` 底部弹层（带报告卡 prefill：来源「跟进鲜丰冷链箱交期」+ AI 建议「与鲜丰确认新交期并调整出库排期」）。可见文案：弹层标题「创建处理任务」、来源条「来自：跟进鲜丰冷链箱交期（与鲜丰确认新交期并调整出库排期）」、字段「任务标题/负责人 我自己（业务员）/截止时间 09-26（周六）」、「AI 建议」块、「立即执行」开关。弹层底部按钮组被屏幕裁切（用户实机视口高不足）。

### 丑点清单（视觉 → 代码归因 → 复现证据）

| # | 丑点（图内证据） | 根因（文件:类） | 复现证据 |
|---|---|---|---|
| A1 | 表单控件双语言：任务标题是 44px 盒式白底描边圆角输入框，负责人/截止时间却是无边框下划线行——同一弹层两套控件观感，像拼凑 | `work.module.css` `.fieldInput`（1px 边框盒式）vs `.pickerRow`（仅 `border-bottom: 1px solid --dshm-stroke-soft`） | 探针：titleInput border `1px solid` / pickerRows border `1px solid rgba(232,237,244,0.6)` 且无 top/left/right 边 |
| A2 | 截止时间行 X 清除图标与 › 箭头并排，同为 primary 蓝挤在行尾，语义与视觉双混乱（清除 vs 进入选择） | `TaskFormModal.tsx:191-208` 内嵌 `span[role=button]` 复用 `.pickerValue`（primary 色）包 X，与 ChevronRight 同容器 | d1-user-3 截图目检：行尾双图标贴边 |
| A3 | 来源条 3 行长文：建议全文拼进括号，浅蓝条占高 ~60px，与下方「AI 建议」块内容重复（同一段建议出现两次） | `TaskFormModal.tsx:158` `来自：{title}（{suggestion}）` 全文拼接；`.sourceStrip` 无行数钳制 | 探针：sourceStrip lines=3 |
| A4 | 「AI 建议」块层级弱：11px 灰标签 + 13px 正文，底色 `--dshm-muted` 与来源条 `--dshm-primary-10` 两种浅底难分辨主次 | `work.module.css .suggestionBlock/.suggestionLabel` | 探针：suggestion bg `rgb(247,249,253)` labelFs 11px |
| A5 | 弹层节奏拥挤不均：sheet gap 4px、字段标签 margin 10/4、各块 margin-top 各自为政 | `work.module.css .sheet{gap:4px}` `.fieldLabel{margin:10px 0 4px}` `.suggestionBlock/.switchRow{margin-top:10px}` | 代码值直接可证 |
| A6 | 弹层无小视口保护：底部按钮组被推出屏外（用户截图实况：可见到「立即执行」即被裁）；复现 375×667 时弹层 525px 已顶到 top=142，任何真实手机 Safari 视口（~650 上下）必然裁掉按钮组，无法完成创建 | `work.module.css .sheetBody/.sheet` 无 max-height / 无滚动（对照：`newchat.module.css .sheetBody` 有 `max-height:60vh`） | 探针：sheet375 top=142 height=525 贴满 667；scrollHeight==clientHeight（不滚，直接溢出裁切） |
| A7 | 关闭按钮无形状（裸 X 图标），与实色主按钮视觉权重失衡；对照 NewChatSheet 关闭钮是 muted 圆底 | `work.module.css .sheetClose` 无背景（`newchat.module.css .close` 有 `background: var(--dshm-muted)`） | d1-user-3 目检 |
| A8 | 取消按钮 hairline 边框 `--dshm-border`（#e8edf4）在白底上几乎不可见 | `TaskFormModal.tsx:233` inline `--border-color: var(--dshm-border)` | d1-user-3 目检 |

注：视觉初诊曾报「背景风险项文字被弹层裁切」——弹层遮罩盖背景是弹层语义本身，非缺陷；「红点橙点大小不一」经查 `messages.module.css .rowDot` 统一 8px，为截图压缩观感误差，不立项。

## 截图 B：首页（#/home，「消息」Tab）

### 画面定位

`#/home`，亮轨。可见文案：Hero「早上好，业务员 / 今天有 3 件事等你」、搜索条、今日台账卡（今日台账 · 09-25 周五；1 待处理 / 0 进行中 / 2 待确认 / 1 已完成）、快捷入口（登记一条单据/问经营/查看工作/找 AI 同事）、AI 同事横滑栏（AI 食安合…/企业数据…/智能填表…/经营参谋/AI 营销洞…）、最近对话 3 条（鲜丰冷链箱登记 09:54 / 登记一条采购入库单，供应商 02:18 / 你好 01:25，均带未读红点）、底部 Tab（消息/同事/工作台/我的）。

### 丑点清单

| # | 丑点（图内证据） | 根因（文件:类） | 复现证据 |
|---|---|---|---|
| B1 | AI 同事名几乎全部截断成省略号（「AI 食安合…」），38 位同事名 6-9 字，卡片内名称区只有 64px | `home.module.css .rosterName{max-width:64px; nowrap+ellipsis}` + `.rosterCard{width:72px}` | 探针：38 个 rosterName，首屏 5 名中 4 名 clipped（75/72/72/87px > 64px） |
| B2 | 全页卡片零阴影：今日台账卡、最近对话列表「贴」在雾蓝底上，层次扁平；与 work 域卡片（border+shadow-card）体系割裂 | `home.module.css .statsCard/.recentList` 无 box-shadow（`work.module.css .workCard` 等都有 `var(--dshm-shadow-card)`） | 探针：statsCard/recentList shadow=`none` |
| B3 | 快捷入口 4 胶囊宽度参差（102/66/78/85px）随文字长短伸缩；`flex-wrap:wrap` 在 375 屏（容器 351px < 需求 355px）会折行 | `home.module.css .quickRow{flex-wrap:wrap}` + `.quickChip` 自适应宽 | 探针：chips 102/66/78/85；flexWrap=wrap |
| B4 | 台账四格密而不分：数字 20px 与标签 11px 贴在一起（gap 1px），四列无分隔、标签纯黑与数字抢重 | `home.module.css .statsGrid{gap:6px}` `.statCell{gap:1px}` `.statLabel{color:--dshm-foreground}` | 代码值 + d1-user-1 目检 |
| B5 | 未读红点 10px 色饱和偏高、紧贴时间右侧无呼吸 | `home.module.css .recentBadge{10px; margin-left:6px}` | 探针：w/h=10 bg rgb(229,72,77) |
| B6 | 最近对话 3 行挤成一块：行高 62px、padding 9/10、行间无分隔线（整卡一体但内部无节奏） | `home.module.css .recentRow{min-height:62px; padding:9px 10px}` 无 divider（对照 `messages.module.css .sessionRow` 64px+stroke-soft 分隔） | d1-user-1 目检 |
| B7 | 末位同事卡被屏幕右缘裁一半，mask 渐隐 18px 过窄，「可横滑」暗示不足像溢出 bug | `home.module.css .rosterScroller` mask `calc(100% - 18px)` | d1-user-1 目检 |
| B8 | Hero 副标题 opacity .92 偏淡、搜索条与 Hero 间距断崖（gap 12px 卡内 14px，观感节奏跳） | `home.module.css .heroDesc/.homePage{gap:12px}` | 观感项，随 B4 节奏微调一并处理 |

注：视觉初诊曾报「进行中 0 外套蓝色椭圆徽章与其余数字不一致」——复现探针与代码均无徽章（statDoing 仅着色），判定为截图缩放/字体渲染观感误差，不立项；「快捷按钮贴边 0 边距」实为 homePage 12px 内边距（复现 rect 证实），不立项。

## 修复对照表（丑点 → 修法 → after 证据）

| 丑点 | 修法（文件:类） | after 证据 |
|---|---|---|
| A1 | `.pickerRow` 盒式化：1px 边框 + 10px 圆角 + 44px 高 + 12px 内边距，与 `.fieldInput` 同语言；:active 压 muted | d1-fix-3-taskform.png；探针 pickerRows border `1px/1px solid`、radius 10px、h 44（390 与 375 两臂一致） |
| A2 | 清除钮独立 `.pickerClear`（span-role button、28px 命中、muted 底）；ChevronRight 转 muted；值保持 primary | d1-fix-3-taskform.png；探针 pickerClear 28×28 bg rgb(247,249,253)、pickerChevron rgb(117,129,153) |
| A3 | 来源条只保留来源标题（建议不再拼进括号——下方 AI 建议块已是它的家），钳 2 行 | d1-fix-3-taskform.png；探针 sourceStrip text `来自：跟进鲜丰冷链箱交期`、clamp 2 |
| A4 | AI 建议块对齐 work 域 `.quote` 语言：muted 底 + 3px primary 左条，label 11px/600 | d1-fix-3-taskform.png；探针 suggestion leftBar `3px rgb(46,124,246)` |
| A5 | `.sheetScroller` gap 12px 统一块间距；各块 margin-top 归零由 gap 接管 | d1-fix-3-taskform.png |
| A6 | `.sheetBody` 加 `max-height: calc(100dvh - 76px)`；表单区包进 `.sheetScroller`（overflow-y auto + overscroll contain）；按钮组沉底固定（hairline 顶线 + 安全区），小屏永远可达 | d1-fix-4-taskform-small.png；探针 sheet375 actions visible=true、borderTop 1px、scroller overflowY auto |
| A7 | `.sheetClose` 补 muted 圆底（对齐 NewChatSheet `.close`） | d1-fix-3-taskform.png |
| A8 | 取消钮边框升 `--dshm-muted-foreground` | d1-fix-3-taskform.png |
| B1 | `.rosterName` 两行钳制（line-clamp 2、11.5px/15、max-width 68px），卡片 72→76px，7-9 字名完整两行显示；骨架卡同步 | d1-fix-1-home.png；探针 38 名中首屏 5 名 clipped 全 false（AI 食安合规官 75px、AI 营销洞察主管 87px 均完整两行） |
| B2 | `.statsCard/.recentList/.recentSkelGroup` 补 `var(--dshm-shadow-card)` | d1-fix-1-home.png；探针 shadow `rgba(23,43,77,0.07) 0 6px 24px` |
| B3 | `.quickRow` 改 `grid repeat(4,1fr)`，胶囊等宽居中恒一行 | d1-fix-1-home.png；探针 chips 4×86px、cols `85.5px ×4` |
| B4 | `.statValue` 20→22px/行高 28；`.statLabel` 转 muted（rgb(117,129,153)）；statCell gap 1→3；列间 border 实色发丝分隔 | d1-fix-1-home.png；探针 statCellRule `1px solid rgb(232,237,244)`（重建后复核于 .d1-home-reshoot-evidence.json） |
| B5 | `.recentBadge` 10→8px、margin 6→4 | d1-fix-1-home.png；探针 badge w=8 |
| B6 | `.recentRow` 64px 高、padding 10/12、行间发丝分隔线（对齐 #/chats 行语言） | d1-fix-1-home.png；探针 minH 64px、divider `1px rgba(232,237,244,0.6)` |
| B7 | mask 渐隐 18→26px | d1-fix-1-home.png |
| B8 | `.homePage` gap 12 保持、`.heroDesc` opacity .92→.95（呼吸微调不破坏品牌渐变） | d1-fix-1-home.png |

## 同页/同模式兄弟面（顺带修平）

- `WorkView` 的「创建任务」入口复用 `TaskFormModal`——自动受益（A 全组）。
- `NewChatSheet` 已是 max-height+muted 关闭钮的正确模式——TaskFormModal 是对齐它，不回退。
- `#/chats` 会话行（`messages.module.css .sessionRow`）已是 64px+divider 健康语言——home 最近对话是向它对齐。

## 执行补记（如实说明）

- **服务进程**：原 PID 51859 于最终复拍前随其终端会话死亡（非本批操作所致——期间仅执行过针对 headless Chrome 残留的 `pkill -f dsh-v6-vfy`，模式不匹配该 node 进程）；已以原命令重启为 PID 63453，:3080 恢复 200。
- **会话数据态**：用户截图的三条会话（鲜丰冷链箱登记/采购入库单/你好）是原进程的当日内存态，随重启而去；全量会话层只剩周二/昨日的旧会话。弹层链路的 after 证据（d1-fix-2~5 + 探针）为 03:19 存档——彼时修复代码已在服务上生效（探针命中的 `.sheetScroller/.sheetActions/.pickerClear/.pickerChevron` 均为本批新类名，铁证）；home 的最终补拍（列分隔实色）在重建产物后完成。
- **产物链路**：:3080 从构建产物服务 ui-mobile，视觉改动必须 `pnpm run build` 后才进页面（statCell 列分隔的首次重拍未生效即因此，重建后探针转绿）。
- **门禁基线**：`test:snapshot` 的 5 文件红与 kb-agent/NocoBase 两个 e2e 红为预存基线（干净 HEAD stash 复跑同样复现），与本批无关；`mobile-assistant.e2e` 通过；vitest ui-mobile 613/613、typecheck/lint(0/0)/build 全绿。
