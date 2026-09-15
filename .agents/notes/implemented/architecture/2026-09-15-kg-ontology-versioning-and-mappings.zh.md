# Agent Note: Versioned KG ontology and the declarative mappings file

Status: implemented

[English](2026-09-15-kg-ontology-versioning-and-mappings.md) | 中文

## 问题

知识图谱五条可用性口径达标四条，缺三面：本体无版本（任何 registry 编辑都是无痕静默变更）、NocoBase→图谱的映射规则混在 `cordis.patch.yml` 的无关插件配置里、构建报告随进程退出即失（质量数字事后无从查看）。

## 决策

留在 SQLite 与 TS registry——L4 调研否决了迁移选项（Kùzu 已归档、核心团队被收购；LinkML 的 JS runtime 四年无维护）。取而代之：

- TS 种子 registry 仍是唯一事实源，新增 semver `ontologyVersion()` 与 append-only 的 `kg_ontology_revisions` 审计表；派生注册（nocobase-derived、agent-defined）走 store 的 revision 审计而非种子版本。`SCHEMA_VERSION` 2→3，v2 旧库被拒并提示重建。
- 映射规则迁入独立版本化的 `kg-mappings.yml`（YARRRML 语义子集方向：collections、fkLinks、skippedRelationFields）。`cordis.patch.yml` 里的旧键存在即 fail loud，双源窗口无法静默漂移。`ctx.kgBuild.mappings()` 与 apiproxy `kg.mappings` 路由把文件暴露给 UI 与 agent。
- 每次构建先落一行 `kg_build_runs`（report+metrics JSON）再算指标；首批指标集为覆盖率/孤岛/冲突/过程计数，经扩展的 `kg.stats` 出口。图谱 tab 增加只读「质量与映射」面板；NL 查询以模板+槽位填充交付（`kg.query` 编译为 `{seeds, relation_types, hops}` 并做闭集校验）而非自由生成——依据 dbt 基准（模板 100% vs 裸生成 64.5%）。
- v1 `kb_graph_query`/`kb_graph_add` 工具改为配置默认禁用（保留代码），终结两代词汇分裂；`kg_subgraph` 仍是 agent 路径，并在 v1 对关闭时验证可用。

## 备选方案

**Kùzu 或其他图引擎。** 上游已死；迁移买到查询语法，失去单 SQLite 文件的运维简单性。

**OWL/SHACL 或 LinkML runtime。** JS runtime 皆不可用；每一个都会引入 TS registry 必须镜像的第二事实源。

**自由 NL→查询生成。** 调研到的准确率差距（64.5% vs 100%）对食品合规图谱是负债；槽位模板覆盖已审计的问题集且可逐模板扩展。

## Consequences

本体编辑成为带 semver 的可审计行；映射变更是 git 里可评审的文件编辑，patch 内旧键存在即 fail loud。质量数字随 kg_build_runs 存活于进程之外，供图谱 tab 面板与 kg.stats 消费。v2 图谱库被拒须重建；agent 侧统一为单一图工具词汇（kg_subgraph），v1 对默认禁用。
