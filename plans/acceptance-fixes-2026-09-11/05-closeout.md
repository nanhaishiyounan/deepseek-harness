# 批次 C5：整合回归收口（全量验证 + 两轮幂等实证 + 文档终态）

> 隶属 [PLAN.md](PLAN.md)。前置：C1-C4 全部合入。本批含破坏性操作：NocoBase reset（drop 库重装）+ 删三份 sqlite + 网关重启。回滚 = 工作树还原对应文件或 revert 对应提交；数据面不设单独回滚，由 reset → `all` 幂等链自愈重建。

**目标**：以最终用户视角全量回归四问题修复效果，实证 setup 全链两轮幂等（含 C3/C4 新步骤），更新交接文档与 PLAN 勾选。

## 步骤

1. **冷启动全链两轮幂等实证**（核心验收，延续上轮 B5 语义并纳入新步骤）：

   ```sh
   rm -f examples/kb-agent/workspace/{kg-graph,kb,lakehouse-catalog}.sqlite*
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts reset
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts   # 默认 all，首跑
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts   # 二跑幂等
   node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts   # portal 重建（若 C4 后未随批重跑）
   ```

   断言：两跑均 EXIT=0；二跑全步 kept/skip（新字段/新表/授权/品牌 upsert 零变更）；`verify` 含 C3（接口/hub/query）与 C4（品牌/图标/favicon）新断言组全绿；`sqlite3` 直查 `kg_nodes>0`；datasets/experts/expert_services/orders 行数下限恢复。
2. **四问题用户视角复验**（真实浏览器，重启网关后进行；DSH Web :3080 + NocoBase :13000）：
   - 图谱 tab：画布填满视口剩余空间、侧栏拖拽跟随、wheel 契约、控件/拖拽/高亮/相机保留（C1 断言集）；
   - 业务管理 tab：无 iframe、入口卡片开新窗、新窗内 NocoBase 可登录有数据（C2）；
   - CRM Portal 四页有数据可排序；Hub Portal 各菜单页（或降级声明）；`crm_activities:query` 200（C3）；
   - admin 登录页/侧栏新 logo 新站名；Portal AI 悬浮球图标渲染；favicon 更新；footer 保留（C4）；
   - 全程零 console error（:13000 与 :3080 双入口）。
3. **全量门禁**：
   - `pnpm run test`（分区按改动面 + scenario 双门禁）；
   - `DSH_BUILD_CLIENT_PROFILE=official pnpm run build && pnpm run test:web`（official 产物前置，品牌守卫契约）；
   - `pnpm run typecheck && pnpm run lint && pnpm run doc-sync`；
   - 五场景 demo `node --env-file=.env --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` 全 PASS（真实轨道）；
   - lefthook pre-commit 门禁：C1-C4 每批提交（含本批）经 pre-commit（oxlint 140 字符折行、EOF 单空行、third-party-notices 再生）零绕过。
4. **证据归档**：C1-C4 各批截图/GIF/命令输出已落 `examples/kb-agent/demos/acceptance-c{1..4}/`；本批补收口实录（路径与要点写入本文件勾选记录）。
5. **文档终态**：
   - [QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md)：冷启动链（含 portal 部署/品牌步骤的新语义）、白标节、已知边界更新；
   - [plans/handoff-2026-09-10.zh.md](../handoff-2026-09-10.zh.md) 顶部追加本轮终态节（新窗口入口、接口修复结论、品牌面、图谱交互能力清单、遗留债）或另立 handoff-2026-09-11（按届时 plans 目录惯例裁决）；
   - 本 [PLAN.md](PLAN.md) 批次总览表勾选完成状态与实际数据；
   - Agent Note 索引汇总（C1 滚动通道裁决、C2 新窗口产品裁决、C3 字段适配根因、C4 白标方案与许可边界）。
6. `pnpm run doc-sync` 终验 EXIT=0。

## 验收断言

上述 1-3 全绿 + 证据文件存在（ls 可查）+ 文档链接可解析。缺任一即本批不通过。

## 风险与回滚

| 风险 | 预案 |
|---|---|
| reset 后长驻网关再次持有旧 inode（B6 已知模式） | reset 前探活警告会提示；本批步骤 2 前强制重启双网关并断言三世界一致 |
| 全量 test 在本机 12 线程并发下的既有环境红（上轮 F9 定性） | 分区单跑取证 + CI 持平台矩阵的既定策略，不算产品回归 |
| hmr-live 上游缺陷豁免维持 | 不重复修复（上轮裁决，证据见 Agent Note `2026-09-11-b5-closeout-regression`） |
| demo 增量导致行数断言漂移 | verify 断言只设下限；demo 后跑 verify 属预期增量 |

## 完成后 PLAN 勾选记录（实施后填写）

| 批次 | 状态 | 实录/证据路径 |
|---|---|---|
| C1 图谱画布 UX | 待填 | `demos/acceptance-c1/` |
| C2 业务后台新窗口 | 待填 | `demos/acceptance-c2/` |
| C3 NocoBase 接口修复 | 待填 | `demos/acceptance-c3/` |
| C4 品牌白标 | 待填 | `demos/acceptance-c4/` |
| C5 收口 | 待填 | 待填 |
