# Agent Note：Mobile v6 B2+B3 —— v6 令牌之上的页面形态与聊天富件批次

Status: implemented

[English](2026-09-23-mobile-v6-uidesign-b2-b3.md) | 中文

## 问题

B1（plans/2026-09-23-mobile-v6-uidesign/01-b1-tokens-shell.md）换掉了令牌双轨并重排了壳，但每张页面仍以 v5 版式渲染在新颜色上：home 仍是台账封面叶，agents 页仍在平铺 preset 列表上顶着 PageNav 返回头，work 页没有工具入口，聊天面仍是 v4 的气泡/输入栏形态。设计稿的页面形态（index (5).html 62–308 行）与富消息词汇（508–761 行）均未落地。

## 决策

**B2 —— 列表页。** home 重排为设计稿「消息」页：渐变 hero 问候卡（被授权的渐变面）、搜索框入口（视觉件，落到持有真实过滤的 `#/chats`）、紧凑今日台账 chip 行（四个状态计数，仍路由 work）、快捷任务 chips、同事头像横滑（右缘渐隐遮罩）、最近会话 conv-item 行 —— 42px 印章头像带状态点、单行投影预览、相对时间、基于 draftStore 已读水位的未读红点（不新造状态源）。agents 页去掉 PageNav（tab 页无返回头），渲染能力分组：colleagues 视觉表新增可选 `group`/`skills`/`status` 字段与 `rosterBandsOf` 分组（空组不渲染组题；未归类 preset 收进「更多 AI 同事」）—— `agentPreset.list` 仍是唯一的在场真源，AI 在场按产品语义恒为「在线」（不虚构忙碌态）。work 页新增 2 列工具网格：每个 roster preset 一卡（头像色图标块、职能描述、去聊聊），点击走真实 `createSession` + `promptSession` 链路并以该同事首条 starter 作为开场消息 —— 设计稿的 `TOOL_SEND` 剧本表不落地。me 页重排为 me-card（54px 渐变头像）、两张 set-group 卡（偏好 / 数据与关于）、46×27 开关胶囊、虚线免责 note；APP_VERSION 读 v6。tasks/files/login 已逐字跟随 B1 令牌，无需修改。

**B3 —— 聊天面。** 气泡取设计稿双态（bot：白底描边托盘带左上 6px 角；user：渐变带右上角，均 78% 宽、`msgIn .28s` 入场）。demo 打字指示改为呼吸三点气泡；day divider 去掉胶囊底。输入区重排为输入栏：+ 入口（面板开时 brand-soft）、22px 圆角输入框、渐变圆形发送钮（禁用态 opacity .45）；停止控件保留。底部上滑快捷面板为自研（非 antd Sheet）：该同事自己的 welcome starters（≤6，与欢迎卡同源）作 2 列指令，加 语音/文件/表情 三个占位工具 toast「演示版暂未开放」—— 点指令收起面板并经 composer 同一通道发出 starter 的 send 文本。

**B3 —— 富消息映射。** 围栏代码先于 `sanitizeBizText` 离开叙述流（rich.ts `splitCodeBlocks`），显示词映射不再改写代码内的标识符；每个围栏渲染为深色代码板（轨道加深的 `--dshm-code-bg`）带语言标签与复制入口（异步 clipboard → execCommand 兜底 → toast；复制不触碰会话日志）。v3/v2 表单卡与报告卡取 rich-card 基底（card2 托盘、13px 圆角、虚线字段规；内层面板翻为 card 面）；决策行取三态按钮（确认写入=pri、重新编辑=ghost、驳回=gray）；报告次级动作取 ghost 填充。starter/ask 选项取 44px 快捷 chip 胶囊（card 面上品牌字衬 35% 品牌描边、按压缩放）；ask 气泡以 notice 图标领起 brand-soft 条。降级围栏渲染 notice 形态（brand-soft、虚线边）并保留人话摘要文本。工作详情时间线取设计稿轴形态（56px 右对齐时间列、光环轴点压 2px 轴线、末行去线），`TimelineStep` 增加 `time`（live：工具行时钟；demo：01 式序号），并派生进度条（done/total、渐变填充、.8s 宽度过渡）。

**明确不落地。** 设计稿的评分五星、echarts 柱状图（报告载荷是离散指标卡，无逐点序列 —— bars 兜底会渲染捏造数据）、逐项 todo 勾选（三层卡无逐项勾选数据面；其相位按钮即勾选语义）。八位虚构同事与 FLOWS 剧本不进代码（grep 干净）。

## 考虑过的备选

- 按 preset 落地设计稿的忙碌/会议在场混排被否：wire 上没有在场源，捏造忙碌态等于对可用性撒谎；状态 chip 机制保留，真实 preset 一律渲染「在线」。
- 用手写 TOOLS 常量（设计稿八项）派生工具网格被否，改为按 roster preset 派生一卡并以该同事自己的 starter 作为开场——剧本式工具表正是计划禁止的 FLOWS 形内容。
- 设计稿的逐项 todo 勾选与 echarts 柱状图没有诚实的数据面可渲染（报告载荷是离散指标卡；草稿卡的相位即勾选语义），两者都不落地，不渲染捏造状态。
- 快捷面板放弃 antd-mobile Sheet 改为自研上滑：面板锚在聊天层内的输入栏上（无 tab bar 需让位），设计稿的 transform 时序直接映射为挂键 CSS 动画。

## 影响

- 快捷面板与深色代码板是新的聊天面；aria golden（`chat.expected.md`）已重录，协议不可见负断言保持绿（无围栏、无表名、无载荷键）。
- 一次误操作的全仓 `test:web:refresh` 重录了无关 golden 并覆盖了 v5 时代未提交的 seed 尾段；seed 的 report/M1/M3 回合（turn 4–6）由注入走查会话的 report 围栏加 golden 自身的文本投影重建，无关 golden 自 HEAD 恢复。重建 seed 的投影与已录 golden 逐字节一致。
- 截图证据：research/2026-09-23-mobile-v6-uidesign/b2-*.png（13 张）与 b3-*.png（13 张，关键卡双轨），由 `.shoot-b2.mjs`/`.shoot-b3.mjs` CDP 驱动器对 `:3080` 以真实会话拍摄（confirm-seed 派生的草稿会话与重建的富会话注入存储）。
