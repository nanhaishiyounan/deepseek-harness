# W8-B2 施工附注（blueprint §4-B2 第 6 项）

日期 2026-10-04。本文件承载 B2 清单中「评估/复核后不改件」的结论。

## 会话列表虚拟化评估（§3 virtualize-lists）

- 现状：`MessagesView` 分页 20 行/页 + 末哨兵加载（`loadMore`），`HomeView` 最近对话仅 3 行，聊天流 history 窗口 200 条上限。
- 实测：200 条 DOM（混合气泡/工具行/卡片）在 375px 视口滚动无卡顿迹象；antd-mobile `ListView`/自建虚拟化会把行高不固定（卡片高度 200px+ 级差）的测量成本换进来，收益为负。
- 结论：**不改件**。分页 + 窗口上限已是当前数据规模（演示/单用户路由集）的正确形态；若 B3 后单账号会话规模上千，再评估 `react-virtuoso` 类动态高度方案。

## z-index 清点（§5 z-index-management）

- 弹层全部走 antd-mobile 的 portal 通道（`getContainer={portalContainer}` 挂壳内 host），层级由 antd 自管理（mask/popup 1000+ 段）。
- 自定义 z-index 仅两类：`newchat.module.css` 的 sheet 阴影层（局部）与 `page-nav.module.css`（无 z-index）。kg 证据 sheet 与 ImageViewer 均经 antd Popup/ImageViewer 通道，无裸 z-index 竞争。
- 结论：**无冲突，不改件**。

## TaskFormModal 草稿覆盖面复核（§8 sheet-dismiss-confirm）

- 现状：表单为受控 state + `destroyOnClose` Popup，关闭即丢（无 form-draft/draftStore 持久化；draftStore 只保 v3 聊天草稿卡）。
- 字段面：标题（必填，已有就近错误 `标题必填` + 拦截）/负责人/截止日（默认明天）/立即执行开关，重填成本 <15s。
- 结论：**B2 不改件**。轻表单 + 默认值回填下丢失风险低；若 B3-2（workStore 服务端投影）落地，随创建通道一并补轻量草稿（标题字段持久化到 sessionStorage 级）更划算，记 B3 候选。

## B2 内裁决记录

- **chips 7→4 的取舍**：按蓝图 §5 content-priority 定稿四枚（登记一条单据 primary / 我的预警 / 我的待办 / 看单据）；「问经营」未保留——蓝图 B2 章节的「倾向保留」被同文档差距矩阵的定稿行（收敛为4，四枚具名）取代，且 home 的 AI 同事 rail 首卡即经营参谋（同名入口仍在屏上）。
- **v3 表单三补的形态**：v3 为单步卡片（三档分区非分步），故第③补按蓝图落为 `inputMode="decimal"` 数值键盘（fieldControls 的 widget 面在 v3 由 `field.widget` 直达，v2 FieldWidget 数值面本就走 Stepper）；「必填标记 *」依蓝图 §8 required-indicators 裁决（保留三档分组语义、空值拦截兜底）不加星标；「提交中禁用」既有 `disabled={sending}` 已覆盖。
- **确认拦截的实现面**：蓝图写「确认钮 disabled」，实现为「点击校验拦截」——disabled 按钮无法承载「拦截后聚焦首个空字段」（无点击事件可挂），点击拦截同时满足探针断言（点确认 → 未发出消息）；驳回不受拦截。
- **quickPanel 220ms 过渡**：开向滑入动画 240ms→220ms 对齐节奏；关向维持瞬时（§7 continuity：单方向入场是已声明 stance，且测试断言关面板后 dialog 立即离场）。
