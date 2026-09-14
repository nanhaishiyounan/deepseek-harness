# Agent Note：G9 统一验证修复——列名漂移的虚假成功与证据链如实化

Status: implemented

[English](2026-09-14-g9-unified-verification-fixes.md) | 中文

## Problem

统一验证 FAIL 78/100，核心业务全通，失分集中在两类。真实缺陷：quick-search 联系人深链落到列表页（G6 的 fork 记录「CRM 无联系人详情路由」判断错误，`show/:id` 路由一直存在）；项目表单绑定 `code` 字段而 `hub_pj_projects` 实际列是 `no`，AI 填充在 UI 显示成功但 API 静默丢弃，落库 NULL（虚假成功）；种子回填无条件覆盖手工编辑值；create 无防重（快速连点建多行）。证据链失实：归档的「暗色」截图实为亮色（与亮色版 MD5 相同、亮度 245+），gates.log 却记作 dark theme。

## Decision

`code → no` 改名覆盖整条读写链——form.tsx（FormField/defaultValues ×2/aiFields）、types.ts（ProjectRecord/ProjectFormValues）、list.tsx（单元格 + CSV 导出）、show.tsx、quick-search.tsx 本地类型与 secondary 行——不只修 AI 绑定。双击防重用 `useRef` flag 在 handler 首行同步短路、`finally` 复位，因为 react-hook-form 的 `formState.isSubmitting` 翻转滞后一拍，同 tick 多次 click 都能穿透。种子回填守卫写成 `row.tag ?? 'AST-…'` / `row.createdAt == null ? […] : []`，复用回填循环既有的 `row[key] !== value` 过滤，不加新分支。暗色截图重录规范：`localStorage.nocobase-theme=dark` + 整页 reload + ~700ms 过渡等待 + emulate viewport 普通截图（F7 教训：fullPage 冻结模块图），每条 gates.log dark 行带双断言：与亮色版 MD5 不同 + 平均亮度 < 150。历史批次日志保留事实行，更正以行内附注（新 MD5/亮度）或 G9 日期小节呈现；「本批零产品改动」「zero column-does-not-exist」这类过度承诺改为如实计数或登记残留（crm_leads.email 族与 crm_deals.contact_id 仍会抛列缺失，留 H 轮）。网关冒烧行补 accept: text/html 回退口径，与深链探活同一探针约定。

## Alternatives considered

**只修 AI 字段绑定（aiFields 的 `name: 'code'` → `'no'`）。** 否决：会留下第二种虚假成功——手填编号照旧静默丢、list/show 照旧读不存在的列，验证发现换个字段就会复现。

**靠 `formState.isSubmitting` 做防重。** 否决：disabled 翻转滞后一拍，同 tick 三连击都到达 onFinish，G9 验收用例（3 连点 1 行）在其下失败。API 层幂等键才是跨进程真防线，登记 H 轮而不是现在半设计地落地。

**用显式 `if (row.tag) return []` 分支守卫回填。** 否决为重复：回填循环已按 `row[key] !== value` 吞掉 no-op 补丁，空值合并表达式以 crm_products 守卫的同款风格表达「保留已有值」。

**把失实的 dark theme 行原地改写成无痕。** 否决：gates.log 行是批次记录，静默改写等于重犯原错。更正同时写明原始状态（亮色 MD5/亮度）与重录值，归档同时呈现失败与修复。

## Consequences

代价：项目表单改名触及六个文件，抽屉表单值类型（`code` → `no`）变形，后续 `ProjectFormValues` 消费方必须用 `no`；守卫表达式让回填行略密。收益：项目编号走通全路径（UI → API → `hub_pj_projects.no` → 列表/CSV/show/quick-search），手工值靠合同而非运气在种子重跑中存活，每次提交意图恰好一行，gates.log 的暗色证据变成可机器校验（MD5 + 亮度）而非叙述。如实残留口径也把下一轮清理的入口条件从「以为做完了」变成「登记清单」。

## Testing

demos/acceptance-g9/gates.log：深链浏览器实测（/contacts/show/1 渲染详情含姓名 + 邮箱）；3 连点仅 1 行落库且 no 非空；种子守卫负路径（手工 tag 与 createdAt 在脚本重跑后双存活）；四张暗色图 MD5/亮度断言；portal tsc 0、vitest 13/13、deploy 双跑树哈希一致、typecheck/lint 0、doc-sync 28/28、e2e 抽查失败经 stash 基线重跑确认非本批回归。
