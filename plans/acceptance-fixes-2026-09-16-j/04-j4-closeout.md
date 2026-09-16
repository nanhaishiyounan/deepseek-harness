# J4：收口回归 + 文档 + 幂等（2026-09-16，批次详档）

> 验收基调延续 G/H/I 轮（[H 轮 PLAN §2-10](../acceptance-fixes-2026-09-15-h/PLAN.md)）：真机实测、AI 实调验证、幂等、门禁全绿、证据归档。前置：J1-J3 全部合入。

## 1. 范围与步骤

### 1.1 全链幂等与回归

1. **setup/data 链幂等**：`setup-dsh-data` 等种子脚本本 Round 无 DB 结构变更（J1-J3 不建表），跑两遍确认零漂移（延续 H7 口径）；场景 yml 扩容重放幂等（J2 脚本已有行跳过）。
2. **快照链二跑**：`examples/kb-agent` 全部快照（kb-presets/scenarios/其他）记录后再跑一次零漂移；`pnpm run test:snapshot`（keyless 面）全绿。
3. **真机全回归**（:3080/:13000/:5432 探活前置，admin 登录）：
   - 七 tab 全活零回归（G/H 轮资产：26 v2 页、SRM/WMS 闭环、Portal 资产、KG 质量面板）；
   - J1：三态选择器（回归 H1 的场景 tab 与 hero 行为——blank chat 保留 headline+示例问题）；
   - J2：五域 AI 实调六问（02 §3-1 清单）+ 场景会话跨域问；
   - J3：03 §3-1~8 全项（注入/操控/问数/幂等/fail loud/重放抽查）；
   - PG tail 无新增错误（`docker logs` / psql 抽查）。

### 1.2 门禁全绿

- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test`（含新包单测）、`pnpm run doc-sync` EXIT=0；
- `pnpm run duplication`（新包代码与 user-questions/time-context 复刻段的克隆检测豁免或重构到阈值内——能力缝同构允许结构相似，超阈值处提取共享 helper）；
- `pnpm run hygiene`（新包 knip/publint/workspace 约束：ui-view-context 进 client 分区、interaction 双包进相应 face，参照 [`scripts/client-tsconfig.spec.ts`](../../scripts/client-tsconfig.spec.ts) 与 project-reference-faces 约束）；
- verify 脚本断言（J2/J3 新增计数）全绿；`gen-cordis-catalog`/`gen-tool-catalog` 再生一致。

### 1.3 文档与 Agent Note

1. **Agent Note ×3（双语，同 PR 内随批合入、J4 统一格式校验）**：
   - J1：`2026-09-16-composer-mode-selector.md`（slot `conversation.input.mode` 契约与三态语义、host 锁定不改的裁决）；
   - J2：`2026-09-16-five-domain-tool-surface.md`（场景全量挂载裁决、kg-nl 下沉单一事实源、assets_browse 面）；
   - J3：`2026-09-16-view-context-capability-seam.md`（三层架构、view-actions 能力缝、模型可见⟺logged 的满足方式）。
2. **用户文档**：QUICKSTART（examples/kb-agent）新增「智能 tab 对话」一节（切 tab 问数/视图操控示例问法、模式选择器三态说明）；受影响包 README（tool-kb/tool-view-actions/view-actions/ui-view-context/view-context 各一段，含 limitations：白名单边界、浏览器在线依赖、多 tab 并行留后）。
3. **docs/ 若触及架构叙事**：`docs/architecture.md` 的插件清单/能力缝清单补三包（按 doc-sync 门禁要求同步，不过度展开）。

### 1.4 证据归档与 handoff

1. `demos/acceptance-j{1,2,3,4}/`：J1 三态截图+切换 GIF/录屏（延续 record-browser-gif 惯例）、J2 六问 transcript、J3 视图操控前后对照截图+注入块截图、J4 全回归清单。
2. [`plans/handoff-*.zh.md`](../handoff-2026-09-15.zh.md) 追加 0.k 节：J 轮终态、提交链、遗留（K 轮候选：@ chip、apply_view_patch、多 tab 引用、五系统 MES 顺延说明——原 J=MES 已顺延为 K）。

## 2. 验收标准（J4 = J 轮完成 definition）

1. 1.1-1.2 全项 EXIT=0/零漂移/全活；
2. AI 实调三主题证据齐（demos 归档，含至少一次失败→修复记录若有）；
3. Agent Note ×3 过 `verify-agent-note-format`；doc-sync 全绿；
4. 提交链：J1/J2/J3（三段）/J4 各自独立提交、可独立 revert，叠在 `4d3665780b` 之上不推送；
5. handoff 0.k 落盘。

## 3. 风险

| 风险 | 预案 |
|---|---|
| duplication 门禁对能力缝复刻段误报 | 复刻以「读通道清单+最小重写」方式做，共享类型从 Service Definition 包导出；确需豁免走窄例外并在 Note 说明 |
| 全回归面大（七 tab+26 页+五系统） | 按 dsh-pre-push-checks 技能选最小覆盖面：J 轮改动面（client/apiproxy/kb/examples）+ 冒烟全库；CI 拥有全量 |
| AI 实调质量不达预期（模型不用 view_apply） | persona/PromptContext 提示词迭代（J3 段 3 预留）；transcript 归档失败案例进 K 轮 |
