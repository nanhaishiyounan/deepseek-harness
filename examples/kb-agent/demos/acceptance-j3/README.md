# J3 真机验收证据：tab 感知智能上下文三层架构（2026-09-16）

网关：`node --import tsx/esm apps/cli/src/bin.ts web --patch examples/kb-agent/cordis.patch.yml`（:3080，浏览器 client bundles 以 `pnpm exec tsdown` 逐包重建后加载）。模型：MiniMax-M3（企业数据助手 preset）。

## 验收链路（会话「把图谱过滤到只显示供应商」，6 轮 23 步）

1. **注入层**（j3-4）：transcript 每轮头部出现「上下文注入 view-context」折叠行；模型 Think 直接引用快照字段（"视图快照显示：选中实体=无/类型过滤=全部/图规模=节点10/边7"）——「以当前 tab 为主」达成。
2. **视图操控**（j3-1→j3-2）：
   - before：图谱画布全类型（节点 1095/边 665 全库，画布默认子图 10/7）；
   - 模型调 `view_apply(kg, set_type_filter, {types:"Supplier"})` → toolview 行「调整视图 · 已将图谱类型过滤为 [Supplier]」→ after：`view_state_get` 回读 `类型过滤:["Supplier"]`，快照确认过滤持久化。
   - j3-2 于 2026-09-17 补拍为强视觉证据：短语查询「宏发食品的供货链」渲染子图后点选类型图例「供应商」，画布仅剩 6 个 Supplier 节点（初拍图过滤已生效但画布尚未渲染节点，弱视觉证据——J5 M3 补拍替换）。
3. **视图内问数**（j3-3）：`view_apply(kg, run_phrase_query, {phrase:"宏发食品供货的所有产品"})` →「短语查询…已渲染（宏发食品 · 1 hops · supplies；节点 12/边 0）」——AI 构造中文短语→模板编译→图谱直接渲染结果子图。
4. **对话内问数**：「当前图谱有多少实体」→ 模型从注入快照直接作答（节点 10/边 7）。
5. **降级链路**（j3-0，第一轮浏览器 bundle 未重建时）：switch_view 超时（APPLY_TIMEOUT fail loud）→ view_apply 报 UNKNOWN_ACTION（known: none reported）→ 模型自动降级到 kg_schema/kg_query/nb_list 从数据面作答并给出手动过滤参数——降级契约按设计工作。

## 实现过程记录的两个真机修复（浏览器侧）

- **模块应用顺序**：业务包在 ui-view-context 之前 apply 时 `ctx.get('viewContext')` 为 undefined，注册被静默跳过（actions 目录空 → 所有 view_apply 报 unknown action）。修复：五个业务包改 `ctx.inject(['viewContext'], …)` 延迟激活。
- **模型参数形态**：模型/适配器链路对嵌套数组的序列化不稳定（`["Supplier"]` 多次被拒、`"Supplier"` 字符串直达）。修复：kg `set_type_filter` 在模型可见工具边界接受 string[] 或逗号/空格分隔字符串。

## 工具面快照

scenarios/kb-presets 预期工具数 20→23（+switch_view/view_apply/view_state_get），快照再生后二跑零漂移（`DSH_SNAPSHOT=refresh` 后 plain run 全绿）。
