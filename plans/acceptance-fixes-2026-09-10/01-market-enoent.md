# 批次 B1：市场 ENOENT 修复（connector-files 目录缺失）

> 隶属 [PLAN.md](PLAN.md) §1.1 根因、§4 决策 1/2。前置：无依赖，可立即动工。

**目标**：任何环境（干净 clone / 目录被删 / 运行中删除）打开「数据资产」tab 不再 500；connector-files 目录随 clone 自带示例数据；产品级自动重建兜底。

## 改动面清单

| 文件 | 改动 | 依据 |
|---|---|---|
| [packages/connector/connector-file/src/index.ts](../../packages/connector/connector-file/src/index.ts) | `apply()` 的启动期 `readdir`（:47-50）：捕获 ENOENT → `mkdir(root, {recursive:true})` 后放行；其余错误照抛 | 现注释"misconfiguration fails the composition"语义保留——只有"目录不存在"自动建，父级是文件（ENOTDIR）等真配置错仍 fail loud |
| [packages/connector/connector-file/src/provider.ts](../../packages/connector/connector-file/src/provider.ts) | `discover()` 的运行期 `readdir`（:51-53）：捕获 ENOENT → 返回 `[]`（空数据集），注释注明仅吞"运行中目录被删"一种情形 | 运行期不应打挂整个市场；与 runtime fail-fast（[connector/src/index.ts:176](../../packages/connector/connector/src/index.ts)）语义解耦 |
| `examples/kb-agent/workspace/data/connector-files/`（新目录，白名单见 [.gitignore:33](../../examples/kb-agent/.gitignore)） | 新增 2-3 个 git 跟踪的示例数据文件（食品行业 csv/md，如 `sample-supplier-prices.csv`、`sample-export-compliance.md`） | .gitignore [:21](../../examples/kb-agent/.gitignore) 忽略 `workspace/data/*`、[:33](../../examples/kb-agent/.gitignore) 白名单该目录；git 追踪文件即保证 clone 后目录存在且有 file-kind 资产 |
| [packages/connector/connector-file/tests/](../../packages/connector/connector-file) | 新增/扩展 spec：目录缺失场景 | 见验收断言 |
| [apps/web/tests/market-pages.e2e.ts](../../apps/web/tests/market-pages.e2e.ts) | 现用例 :193-206 预建 connector-files+csv——**保留**；另加一个"不预建目录"的世界变体或用例 | 现有用例测的是有数据路径；新用例锁"缺失不再 500" |
| [examples/kb-agent/QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) | :22 手动 mkdir 指引改为"自动创建"说明；:314 FAQ 条目更新为已修复 | 文档同步 |
| connector-file README（三语） | 补"目录缺失自动创建/空数据集"契约 | 文档同步 |

## 实施步骤

1. **写失败测试**（connector-file 包单测）：
   - `apply()`：root 指向 tmp 下不存在的嵌套路径 → 组合加载成功且目录已建；
   - `apply()`：root 父级是普通文件（ENOTDIR）→ 组合加载失败（fail loud 保持）;
   - `discover()`：加载后手动删目录 → 返回 `[]` 不抛。
2. **实现**：上述两处最小修改（每处 ≤6 行 + 注释；空 catch 按仓库规范注明吞的是什么）。
3. **示例数据**：在 connector-files/ 提交 2-3 个真实感小文件（内容取自食品行业语境，几行即可；命名带 `sample-` 前缀明示演示用途）。`git status` 确认被跟踪（白名单生效）。
4. **e2e 变体**：market-pages.e2e.ts 新用例"market page tolerates missing connector-files dir"——boot 后删除（或不建）connector-files → 打开数据资产 tab → 断言 heading '数据资产市场' 可见、目录计数 >0（NocoBase provider 侧资产仍在）、**无 errorStrip**。
5. **联动检查**：[kg-build.mts:66](../../examples/kb-agent/scripts/kg-build.mts) 同路径挂 ConnectorFile 的用法不受影响（自动建目录后 discover 空列表正常）。

## 幂等要求

- mkdir recursive 天然幂等；示例文件 git 静态存在，无 setup 侧写入（setup 链 ensure 留给 B2 的 setup-dsh-data 统一做，本批不动 setup）。

## 验收断言（可自动化，防假阳）

1. `pnpm --filter @deepseek-ai/dsh-connector-file test` 全绿（含新增三用例）。
2. `pnpm run test:web -- -t market` 全绿（含新"缺失目录"用例：**断言 products>0 且页面无『市场暂不可用』文案**）。
3. 干净 world 实证（命令级）：mkdtemp 临时目录为 DSH_HOME、workspace/data 下**不建 connector-files** 起 `dsh web --patch` → `assets.stats` 返回 200 且 `products ≥ 1`（示例文件资产）。
4. `pnpm run typecheck && pnpm run lint` EXIT=0；`pnpm run doc-sync` EXIT=0（README/QUICKSTART 改动）。

## 测试与文档同步

- Agent Note（implemented/process 类）：记录"空数据集意图 vs fail-loud 约定"的缺口与裁决（ENOENT 自动建、ENOTDIR 照抛）。
- 非平凡改动同 PR 附 Agent Note；QUICKSTART FAQ + connector-file README 同步。

## 回滚

还原 connector-file 两处改动 + 删示例文件即可（无数据迁移、无 schema 变化）。
