# H1 before 基线证据（2026-09-15，:3080 真机 a11y 树摘录）

图谱 tab 选中（`tab "图谱" selectable selected`）时，场景门户整段仍渲染在会话输入区上方：

```
tab "对话" selectable
tab "知识库" selectable
tab "数据资产" selectable
tab "连接器" selectable
tab "图谱" selectable selected        ← 当前在图谱 tab
tab "业务管理" selectable
tab "轨迹" selectable
...
StaticText "文档 21"                   ← 用量 chips（KB 元素）
StaticText "检索 6 次"
StaticText "30 个场景"
button "酱油中山梨酸钾的最大使用量？"   ← 示例问题
button "GB 14881 车间虫控要求？"
region "场景"                          ← 场景门户整段
StaticText "30 个场景 · 分类浏览"
searchbox "搜索场景"
StaticText "精选场景"
button "AI 营销洞察主管 …" ×6
StaticText "按分类浏览"
button "市场洞察 5" / "工艺 4" / … ×8
region "最近检索"
```

根因：hero 门户挂 `conversation.input.dock`（`packages/client/ui-kb/src/client/index.ts:187`），宿主 `ConversationRoot.tsx:173` 无条件渲染该座位 —— 连接器/图谱/业务/资产 tab 全部泄露（用户原话「不要每次点连接器、图谱什么的都展示！！！！」）。

修复方向（10-h1 计划）：KbHeroDock 迁为第七业务 view `scenarios`（order 10.5，浮点排序已在 `ui-slots/src/index.ts:867` 数值比较上验证可行）；删除 input.dock 的 kb-portal 注册；`bridge.workbench` 让位镜像整体退役（消费方仅 KbHeroDock + KbWorkbench.settleWorkbench 两处，KbHeaderButton 走 bridge.provide 保留）。
