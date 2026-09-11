# 批次 B5：整合回归收口（全量验证 + 幂等实证 + 文档终态）

> 隶属 [PLAN.md](PLAN.md)。前置：B1-B4 全部合入。本批含破坏性操作与代码变更：NocoBase reset（drop 库重装）+ 删三份 sqlite、测试基建修复（assembled-boot 的 WebGL stub、45 文件 golden 重录、steering 选择器收窄）与 setup 链补全（`setup-dsh-data.mts` 编排名册/订单进 `all`）。回滚 = 工作树还原对应文件或 revert 对应提交；数据面不设单独回滚，由 reset → `all` 幂等链自愈重建。

**目标**：以最终用户视角全量回归三问题修复效果，实证 setup 全链幂等，更新交接文档与 PLAN 勾选。

## 步骤

1. **冷启动全链幂等实证**（核心验收）：
   ```sh
   # 模拟最彻底重置：三份 sqlite 删除 + NocoBase reset（drop 库重装）
   rm -f examples/kb-agent/workspace/{kg-graph,kb,lakehouse-catalog}.sqlite*
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts reset
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts   # 默认 all，首跑
   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts   # 二跑幂等
   ```
   断言：两跑均 EXIT=0；二跑全步 kept/skip；`sqlite3` 直查 kg_nodes>0（有 key ≥600）/kg_edges>0；datasets/experts/expert_services 行数恢复（市场目录 ≈176 项）。
2. **三问题用户视角复验**（真实浏览器，DSH Web :3080）：
   - 数据资产 tab：无「市场暂不可用」，目录资产数 >0（实录记数）；
   - 图谱 tab：打开即有图（画布节点 >0），短语游走/双击展开可用；
   - hero 门户：精选 ≤6 + 收纳 + 检索可用；六页签视觉明暗检查；
   - 全程零 console error。
3. **全量门禁**：`pnpm run test`（含 scenario-catalog-sync/scenarios 双门禁）、`DSH_BUILD_CLIENT_PROFILE=official pnpm run build && pnpm run test:web`（本地裸跑 `test:web` 会多挂 built-boot——无 profile 的构建产物令品牌守卫自我关闭，须先出 official 产物）、`pnpm run typecheck && pnpm run lint && pnpm run doc-sync`、`pnpm run build`；五场景 demo `node --env-file=.env --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` 全 PASS（真实轨道）。
4. **证据归档**：本批截图目录（六页签×明暗 + hero 三态 + 图谱/市场特写）+ 命令输出实录，均落 `examples/kb-agent/demos/` 对应批次目录；路径写入本文件勾选记录。
5. **文档终态**：
   - [QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) 冷启动链终版（两步）；
   - [plans/handoff-2026-09-10.zh.md](../handoff-2026-09-10.zh.md) 顶部追加本轮终态节（新入口无变化；数据面规模表更新：图谱/市场/setup 链新语义；双入口回归结论）；
   - 本 [PLAN.md](PLAN.md) 批次总览表勾选完成状态与实际数据；
   - 汇总各批 Agent Note 索引（B1 fail-loud 裁决、B2 setup 链扩展与默认视图、B3 IA 决策、B4 骨架沉淀）。
6. `pnpm run doc-sync` 终验 EXIT=0。

## 验收断言

上述 1-3 全绿 + 证据文件存在（ls 可查）+ 文档链接可解析。缺任一即本批不通过。

## 完成后 PLAN 勾选记录（2026-09-11）

| 批次 | 状态 | 实录/证据路径 |
|---|---|---|
| B1 市场 ENOENT | ✅ | `demos/`（B1 批内截图与用例，含「目录缺失不再 500」） |
| B2 图谱内置 | ✅ | reset 后 all 重建图谱 1073 节点/594 边；图谱页默认子图 |
| B3 场景 IA | ✅ | hero 精选+收纳+检索的 e2e 断言与快照（golden 已随侧栏四入口重录） |
| B4 视觉提升 | ✅ | 六页签明暗截图 + 28 文件 golden replay 复验 104 passed |
| B5 收口 | ✅ | `demos/full-journey-20260911-160059.md`（demo 5/5）；幂等二跑全 kept；Agent Note `.agents/notes/implemented/process/2026-09-11-b5-closeout-regression.zh.md` |

## 风险与剩余债务汇总（2026-09-11 终验 90/100 CONDITIONAL_PASS，B6 签收补记）

- **豁免 hmr-live×1**：`pnpm run dev:web` 在本机确定性崩溃——tsx 与 tsdown 经 import-without-cache 在同进程内的 load-hook 互操作缺陷（Node 22.19.0），修复需上游演进；证据与最小复现见 Agent Note `2026-09-11-b5-closeout-regression`。CI 的 Linux 矩阵持有该信号。
- **环境项 remote-welcome×1 / smoke-real×1**：串行单跑复绿（run2 的 smoke-real 失败横跨一次系统休眠），判定为环境项而非产品回归。
- **范围外（经裁决不做）**：KgGraphCanvas 改动态 import sigma（单文件 bundle 是已裁决设计，jsdom 缺口归测试环境 stub）；专家名册改文档删声称（「重置后单跑 all 即完整系统」语义的一部分）。
- **reset 网关失效**：长驻 `dsh web` 网关持有已删 sqlite 旧 inode 的三世界不一致——QUICKSTART「重置数据」节明示 + `setup-nocobase.mts` reset 探活警告双管落地（B6）；自动 kill/restart 超出最小修复，不做。
- **Minor 收尾（B6 已修）**：market-pages 空 catch 补注释、B5 Note 重录统计改真实口径（45 文件 +536/-54）、handoff 冷启动残留 kg-build 行删除与市场数字时点口径统一。
