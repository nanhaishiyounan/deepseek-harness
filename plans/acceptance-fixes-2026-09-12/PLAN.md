# 用户验收反馈修复计划（第三轮）：hub schema 全量对齐 + 项目管理 AI 员工 + 深链 fallback + 品牌收尾 + 图谱点击证据（2026-09-12）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-hub-schema-alignment.md)~[06](06-closeout-regression.md)。所有根因结论附 `文件:行号` 证据；调研经 4 路并行 project-research（hub 列错配全量扫描 / AI 员工载体 / 深链与品牌 / 图谱点击考古）完成，关键实锤行号已人工抽查复核。基线 HEAD=`84d6dc70aa`（上轮 C1-C8 十提交未推送，验收 PASS 100/100）。

**目标一句话**：五项已登记技术债全部勾销 + 新问题「项目管理不能添加 AI 员工」修复——hub 17 表 schema 与 Portal 前端合同全量对齐（无损增量）、AI 员工进任务负责人选项、Portal 深链直开 200、品牌文案/twitter:image/favicon 收尾、图谱真实鼠标单击证据闭环。

**北极星（用户原话）**：

1. 五项技术债「这些都解决掉」：①深链直开 404；②vendored Portal 源码级文案（"Salesroom CRM" 等）；③hub schema 从类型反推未核验；④图谱真实鼠标单击人工复核项；⑤twitter:image 前缀与根路径 favicon 别名
2. 「项目管理的区块怎么不能添加ai员工」

---

## 1. 调研结论摘要（六问题根因）

### 1.1 技术债③爆发 + 问题2 的 schema 半边（R1/R2 交叉实锤）

PG 四条列不存在报错全部定位到前端代码行（详见 [01](01-hub-schema-alignment.md) 规模表）：**17 张错配表（11 已建表 + 6 整表缺失）、列级 20 项、关联 25 项、枚举差异 6 组**。核心机制：前端把 NocoBase belongsTo **默认派生 FK 名**（`singular(collection) + '_' + assoc + '_id'`，如 `hub_pj_task_assignee_id`）当硬合同用，种子侧全部显式短 FK 且 `assignee/owner` 根本建成了文本 input 字段——[my-tasks/index.tsx:85](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/my-tasks/index.tsx:85) 的 filter 即 PG 报错直接来源（admin id=1 逐字吻合）。前端 schema 合同文档：[replicate-prompt.ts:62-68](../../platform/nocobase-portals/demo-portal-hub/src/components/build-story/replicate-prompt.ts:62)。顺带发现 CRM Portal 3 处残留（deals 详情两处 `dealId` filter + `crm_targets` 整表缺失）。

### 1.2 问题2 的选项半边：AI 员工不在 users 表（R2）

「项目管理区块」= hub Portal projects 模块（置信度高）。「添加 AI 员工」双重缺陷：schema 修复后负责人选择器 [UserPicker](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/pickers.tsx:207) 数据源是 `users`，而 **AI 员工只在 plugin-ai 的 `aiEmployees` 表**（9 位）、users 表只有 Super Admin——下拉里没有任何 AI 员工。次级：表单 AI 代填组件只挂了 finance/sales 两表单，tasks/projects 没挂。32 位领域专家在第三张 `experts` 表（市场模块），**不进 users**（范围控制）。ACL 不是失败原因（demo 登录者=root）。详见 [02](02-pj-ai-employees.md)。

### 1.3 技术债①：深链 404 精确发生点在 NocoBase gateway（R3）

`/dist/` 分支 serve-handler 硬编码无 rewrites（[gateway/index.ts:489-502](../../platform/nocobase/packages/core/server/src/gateway/index.ts:489)），文件 miss 直接 404；admin SPA fallback 在 :575 但被提前命中。快照侧不可配置（改=vendored 核心 local-modification）。**修复层裁决：DSH 网关层**——webserver 注册 `/nocobase/dist/{crm,hub}` 双长前缀路由，上游 404 且 GET/HEAD+text/html 时 fallback 到对应 portal index.html（走既有 HTML 重写管线）。详见 [03](03-portal-deep-link.md)。

### 1.4 技术债②⑤：品牌面三小块（R3）

- **fork 文案合规口径已核实**：portals 是应用模板（[AGENTS.md:3](../../platform/nocobase-portals/demo-portal-hub/AGENTS.md:3)），核心 MANIFEST 零提及 portals，源码级改合规；"Powered by NocoBase" 在 portal 源码 0 命中（义务在 admin 侧，保留）。可替换 ~10 处（"Salesroom CRM"/"All in one"/displayName "CRM DEMO"——displayName 经 vite define 进 bundle，post-build 不可达，**必须源码改**）；
- **twitter:image**：[nocobase-proxy.ts:50](../../packages/host/webserver/src/nocobase-proxy.ts:50) 重写集只有 og:image（C7/C8 已修），twitter 同型漏网——1 行正则扩展；
- **根 favicon 别名**：admin 入口无 favicon link → 浏览器回退请求根 `/favicon.ico` → gateway 伪 200 text/html——[n25-brand.mts](../../examples/kb-agent/scripts/nocobase-n25-brand.mts) overlay 加 1 行复制到 dist 根，零代码改动。

详见 [04](04-brand-polish.md)。

### 1.5 技术债④：图谱点击的失败归因修正（R4，源码级）

sigma@3.0.3 **不检查 isTrusted**（handoff 旧表述不准）。真实失败双层：①命中判定=WebGL picking framebuffer 读像素，headless 常读零色（C1 trusted 点击 headless 全空即此层）；②「周期性 remount」源=**HMR 链**（500ms stat-poll→SSE rebuilt→ui-kg 热重载），验证与构建并行必竞态——产品代码本身无定时 remount。推论：headed 真实 GPU + 静态 dist 下 trusted 点击 + 实例 API（`graphToViewport`）反算坐标应命中。方案：playwright headed + video 新脚本，**不进门禁**；1 小时失败降级人工 SOP。详见 [05](05-graph-click-evidence.md)。

---

## 2. 技术决策（已定，实施不再讨论）

1. **D1/D2 分批不合并**：D1 完成全部 schema/种子对齐（含 assignee/owner/assignments.assignee 三处文本→关联迁移），D2 专注 AI 员工（users 种子 + 表单挂载 + UX 闭环）——D1 是 D2 的地基，但两者验收场景独立、回滚独立。
2. **无损补列铁律**：全部走 `fields:create`（=ALTER ADD COLUMN）+ `update` 回填，**不 DROP 不重建表**；唯一例外=三处同名字段迁移（string→belongsTo 不能并存），用**三步迁移 + 备份列续命**（`assignee_text` 保留原值不删，幂等分支覆盖 string/缺失/belongsTo 三态可安全重入）。D1 验收在**用户现有库**上做（不 reset）；reset 全链实证推迟到 D6 并明示会清演示数据。
3. **FK 列名服从前端合同**：显式 foreignKey 取前端派生名（`hub_pj_task_assignee_id` 等），不让 NocoBase 再派生；camelCase 合同（`assetId`/`parentId`/`dealId`）照建。
4. **AI 员工进 users、32 专家不进**：9 位 AI 员工按 username/nickname ensure users 行（无密码）；专家留在 experts 表。workload 把 AI 员工算"人力"是期望的演示语义；my-tasks 只对人类有意义（语义确认项写入验收说明）。
5. **深链修复层=DSH 网关**（唯一自有层）；fallback 仅 GET/HEAD+`Accept: text/html` 导航请求，资产/API 404 照旧（测试锁定）；顺带修无尾斜杠 301 Location 跳出前缀问题。
6. **品牌文案源码级改**（displayName 进 bundle，post-build 不可达）；统一 `DSH食品业务平台`（[dsh-brand.mts:9](../../examples/kb-agent/scripts/dsh-brand.mts:9) 既有真源，不自造新名，两 portal 不派生区分名）。
7. **图谱证据不进门禁**：demos 人工触发定位维持；CI 无头无 GPU 必假。归因表述修正随 D5 落 handoff。
8. **枚举差异可选降级**：6 组不报错只影响筛选项，时间不够整体降级为 QUICKSTART 已知边界声明（不影响验收主线）。
9. **验收基调延续**：PG 层断言列存在（psql information_schema 直查 + verify `portalListProbe` 精确 wire 重放）+ 前端请求 200 + 增量幂等双跑（现有库）+ reset 全链两轮幂等（D6）+ 门禁全绿 + 截图证据落 `examples/kb-agent/demos/acceptance-d{1..6}/`。

---

## 3. 批次总览（6 批，顺序执行）——全部完成（2026-09-12）

| 批次 | 一句话 | 文档 | 依赖 | 状态 |
|---|---|---|---|---|
| D1 hub schema 全量对齐 | 17 表错配修复：4 处文本→关联迁移 + 33 加列/关联 + 6 新表 + fixture + CRM 3 残留 + verify 扩展 | [01](01-hub-schema-alignment.md) | 无 | ✅ `40ca9c0fb8`，证据 `demos/acceptance-d1/` |
| D2 项目管理 AI 员工 | AI 员工种进 users（9 位）+ tasks/projects 表单挂 ai-employee-fill + UX 闭环验收 | [02](02-pj-ai-employees.md) | D1（assignee belongsTo） | ✅ `a851859c94`，证据 `demos/acceptance-d2/` |
| D3 Portal 深链 fallback | webserver 双长前缀路由 + 404→portal index.html fallback + 301 Location 补前缀 | [03](03-portal-deep-link.md) | 建议在 D1/D2 后（重启网关） | ✅ `a30e22f259`，证据 `demos/acceptance-d3/` |
| D4 品牌收尾 | fork 文案 ~10 处源码替换 + twitter:image 正则 + favicon 根别名 overlay | [04](04-brand-polish.md) | 建议在 D2 后（同一条 deploy 链） | ✅ `26db47023e`，证据 `demos/acceptance-d4/` |
| D5 图谱点击证据 | playwright headed+video 脚本（实例 API 反算坐标）+ handoff 归因修正；失败降级人工 SOP | [05](05-graph-click-evidence.md) | 无（独立脚本） | ✅ `249d2c9add` 一次通过，证据 `demos/acceptance-d5/`（未降级） |
| D6 收口回归 | 现有库增量幂等双跑 + reset 全链两轮 + 全量门禁 + 遗留债五项勾销 | [06](06-closeout-regression.md) | D1-D5 | ✅ 本批提交；实录 `demos/acceptance-d6/` + handoff 0.c |

实施实录（偏离与补充）：① D1 的 category 也是同名字段冲突（第四处迁移，`category_text` 备份）；② CRM dealId 不能用同名 belongsTo（Sequelize naming collision），改裸 integer 列；③ 枚举对齐做了追加式而非降级；④ D6 reset 实测暴露全新库路径两处分叉并修复（kb_categories 种序、迁移字段关联对象赋值不落 FK → directFk 裸列双写）；⑤ official test:web 首跑 6 failed = hmr-live 豁免 + 5 个同机并行门禁资源争抢 flaky（空载重跑 21/21 全过取证）。

顺序理由：D1→D2 严格串行（地基）；D3/D4/D5 互相独立，但 D3 需重启网关、D4 需 portal 重建，统一排在数据面批次后减少会话打断；D5 随时可做；D6 收口。

---

## 4. 验收标准（本轮完成定义）

1. **schema（债③+问题2 半边）**：PG 直查断言列存在（实锤四列 + 抽查）；verify `portalListProbe` 新断言组全绿（缺列必 400 的 wire 重放）；hub Portal 全模块页面有数据可排序过滤（截图）；现有库迁移后行数不变且 `assignee_text` 保留原值；增量二跑全 kept。
2. **AI 员工（问题2）**：任务/项目表单负责人下拉出现 9 位 AI 员工、提交后详情/workload 正确渲染；表单 AI 代填按钮出现（N22 ready 时）；PG 无新列报错。
3. **深链（债①）**：`:3080/nocobase/dist/{hub,crm}/<深层路由>` 直开与刷新均 200 渲染对应页面；API/资产 404 不被吞；webserver 分区单测绿（≥6 新用例）。
4. **品牌（债②⑤）**：部署产物与运行时全无 "Salesroom CRM"/"All in one"/"CRM DEMO"；twitter:image 与 og:image 双双带前缀且 URL 200；`/favicon.ico`（:13000 与 :3080）200 非 text/html；"Powered by NocoBase" footer 保留。
5. **图谱（债④）**：kg-real-click 脚本 EXIT=0 + 四件套证据（或 1 小时降级人工 SOP + 归档）；handoff 遗留债五项逐条勾销 + 归因表述修正。
6. **过程资产**：每批证据落 `demos/acceptance-d{1..6}/`；D6 两级幂等实证（现有库增量 + reset 全链）；`typecheck/lint/doc-sync` EXIT=0、分区 test + official `test:web` 绿（hmr-live 豁免维持）；Agent Note（D1 迁移算法/D3 层裁决/D5 归因修正）；lefthook 零绕过。

---

## 5. 硬约束（实施全程有效）

- **用户库无损**：D1-D4 全部增量操作（fields:create/update/幂等 ensure），不 reset 不 drop 表；唯一字段 destroy 仅限三处迁移且备份列先行。reset 仅发生在 D6 且明示。
- 不修改 `platform/nocobase` 快照源码（深链修复不走 gateway 层）；portal fork 源码改文案/挂组件合规（模板预期用法）但不得引入新依赖。
- 许可合规：admin 侧 "Powered by NocoBase" 与非主 LOGO 品牌位保留（LICENSE §5.2）。
- 种子链幂等语义：所有新步骤挂 `all` 链且二跑 kept；既有步骤行为不变只追加；迁移算法三态分支可安全重入。
- 不推翻上轮裁决：不做网关自动 kill/restart（探活+手动重启维持）；KgGraphCanvas sigma 栈不动；hmr-live 豁免维持；32 位专家不进 users。
- 范围控制：不做 member 角色权限体系、不做 portal 服务端搜索（UserPicker 200 上限远未达）、不做两 portal 品牌区分名、不做枚举全量重造（可选对齐或降级声明）。

---

## 6. 风险总览

| 风险 | 等级 | 预案 | 所属批 |
|---|---|---|---|
| 字段迁移中断在 destroy 之后 | 中 | 三态幂等分支安全重入 + `assignee_text` 备份列保留原文 | D1 |
| 同名字段并存冲突 | 中 | 迁移严格先 destroy 后 create，不并存 | D1 |
| users 混入 AI 员工/人名行副作用（登录页、用户管理可见） | 低 | 无密码不可登录；QUICKSTART 声明 demo 语义 | D1/D2 |
| 6 新表 fixture 数据质量 | 低 | 按 replicate-prompt 合同字段构造，量小（41~484 行） | D1 |
| 深链 fallback 吞上游真实 404 | 低 | 仅导航请求；测试用例锁定资产/API 行为 | D3 |
| displayName 改名引起 portal 产物大 diff | 低 | deploy 树哈希重录为新基线 | D4 |
| headed picking 仍不命中（GPU 环境差异） | 中 | 1 小时时限降级人工 SOP（债④仍闭环，标注证据形态） | D5 |
| reset 清用户演示数据 | 低 | 行数快照存档 + 实录明示（修复过程已无损，收口实证为惯例） | D6 |
| 全新库与存量库迁移路径分叉 | 低 | 共用终态断言（type=belongsTo+FK 名）；D6 首跑即全新库实测 | D1/D6 |
| 长驻网关旧 inode（批次间） | 中 | 数据面/服务端批次验收前探活重启（QUICKSTART 义务） | 全局 |
