# Agent Note: 移动端 v6 C1 — 元素级组件面（antd-mobile 升面）

Status: implemented

[English](2026-09-24-mobile-v6-c1-component-surface.md) | 中文

## 问题

v6 面的用户反馈：元素的样式有些还是原生的，为什么不使用组件库，样式很难看 —— 大量元素级控件仍是 CSS Modules 手绘（按钮、chip、徽标、状态点、头像、空态、进度条、输入框），整个应用读起来像两套产品：antd-mobile 的组件面（Switch/Picker/Dialog/CapsuleTabs/SearchBar/Toast）旁边立着手绘的近似物。v6 视觉真源（index (5).html）仍是色/圆角/间距取值的出处；本批把实现载体换成 antd-mobile 组件，经 `--adm-*` 管道达到同等视觉。

## 决策

**Dial 约定。** antd-mobile 组件的面色由渲染期读取的 CSS 变量持有，其中若干（Tag、Badge）以*内联*样式设置这些变量 —— 类级变量声明斗不过组件自身的内联默认值，且 Button 的 `fill=outline/none` 配色规则骑在 (0,3,0) 特异性上，普通 module 类打不赢。因此本批落一个约定：**色彩面骑 JSX 上的内联 CSS 变量 dial（组件自身官方 NativeProps 通道 —— 零特异性对抗、jsdom 稳定），尺寸/排版（高、内边距、字号、字重、圆角）骑 `.xxx:global(.adm-button)` 式 module 类。** 每个被替换的手绘类连同其自定义底/字/按压样式一并删除；保留的类只承载布局尺寸。

**按钮族。** 报告卡主/次臂（solid 对 brand-soft ghost，ghost 经内联 dial）、work 卡的开始执行/打回/确认完成/查看进度/查看结果（solid / 带 hairline 边的 outline / none-fill 品牌字）、home 快捷 chip 与 section 链接、TaskForm 的取消/提交（提交顺带获得组件 loading 面）、NewChat 表单 chip、登录的「获取」验证码臂、profile 快捷入口与退出登录、agents/work 空态 CTA、work 头部入口、composer 候选 chip、欢迎 starter chip、代码板复制入口、以及「来自对话」来源徽标 —— 全部 antd-mobile `Button`（`color` × `fill` × `size` 组合出三态）。sheetCancel/actionSecondary/entryLink 等 outline 臂经内联 `--border-color` dial 带 hairline 边（antd 默认 outline 描的是文字色而非 border token）。

**Tag/徽标/头像。** 公共 `Badge` 原子（ui.tsx）现在渲染 antd-mobile `Tag`，tone→内联 dial 的面色映射；技能 pill、在场 chip、示例 tag、files 的类型/来源徽标、动作回执胶囊、NewChat 表单 chip 全部骑 `Tag` + token dial。在场状态点与未读点骑 antd `Badge`（`content={Badge.dot}` 包裹戳记头像），经 `--top/--right` dial 停靠右下并带 card 描边。戳记头像本体保持自定义 span：antd-mobile 的 Avatar 是图片专用（`src: string` 必填），而身份戳记是首字块没有图像源 —— 即任务简报自己允许的 fallback。

**空态/错误/进度/骨架/输入。** work/tasks 空态本就骑 ErrorBlock；其 CTA 与 home 的重试链接换成 none-fill Button。work 详情的 done/total 条换成 antd `ProgressBar`（`--fill-color` dial 用户渐变）。公共 `SkelRow`/`SkelCard` 与 home 的 roster 骨架换成 antd `Skeleton` 块（animated；reduced-motion 覆盖冻结 shimmer），全局 `dshm-skel-pulse` keyframe 退役。TaskForm 标题与 v3 草稿字段输入换成 antd `Input`（`clearable`、onChange(val) 签名、盒面骑 wrapper 类）；agents 的本地搜索框换成 antd `SearchBar`（与 chats 层同一套 dial）。

**按分类保留自定义。** 行为行/卡（会话行、roster 行、工具卡、台账卡、搜索入口、任务行、回执行 —— 按简报属布局容器）；`role="radio"` 的 ask 选项（antd Button 不透传 role/aria-checked）；图形触点（X 关闭、返回、加号、发送 —— 渐变发送钮是四处特许渐变面之一）；带双行 hint 的 ask 选项 chip。原生 `<input>`/`<textarea>` 全 app 归零；剩余 33 处 `<button>` 全部落入分类保留清单。

## 替代方案

- 用 module 类的变量声明覆盖 Tag/Badge 颜色：已试并放弃 —— 组件在渲染期内联默认值，类变量永远赢不了，故有内联 dial 约定。
- 用堆叠 module 选择器对抗 Button 的 (0,3,0) outline 规则：因依赖加载顺序的脆弱性被否；内联 dial 是组件自身支持的通道。
- antd-mobile `Avatar` 用于同事戳记：因其 API 被否 —— `src` 是必填 string，而戳记是 token 底的首字块；为取悦组件伪造图片 URL 就是撒谎。

## 后果

- 交互契约全部保持：disabled/loading 门、双击锁（startingRef 守卫）、行锚定、aria 标签（antd prop 面不携带 aria-label 处经外层 label 命名）、测试的 role/text 断言 —— ui-mobile 613/613 绿，仅三处选择器更新（agents 搜索占位符、v3 裸输入查询、e2e `getByLabel('数量')`），per-file 覆盖仍 100%。
- mobile 三件套（mobile-assistant/mobile-shell/mobile-preview-iframe）无需重录即过：aria 快照是 role/name 级，组件替换不触动；协议围栏不可见负断言保持绿。
- 每个+被替换手绘规则的 CSS Modules 相应缩减（report/starter/chip/action/sheet/sourceBadge/skillPill/statusChip/demoTag/skel 各类及全局 keyframe）；`--adm-*`/`--dshm-*` 双生轨道驱动所有新面，亮暗、430 壳、portal 限位保持（双轨 21 张 c1-* 截图验证）。
