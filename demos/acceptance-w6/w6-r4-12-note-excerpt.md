# ⑧ 真话债清偿摘录（W6-R4）

## 1. Agent Note「assert 17/17」→ 实测 14/14（R4 后 20/20）

修正文件：`.agents/notes/implemented/feature/2026-10-02-w6-b7-scm-bid-matrix.md` / `.zh.md` 第 29 行

修正后（中文版摘录）：

> `w6-b7-assert.log`：14/14（结构 3 项、比价表/采购订单 JSBlock 与两张图表 4 项、形态 table=3/8 1 项、live 探针与 demo 终态 6 项）。W6-R4 复核修正：原文误记 17/17，实测计数以日志为准；R4 轮扩充断言后为 20/20（见 w6-r4-02-assert.log 与 W6-R4 Note）。

实测依据：
- `w6-b7-assert.log`（B7 原始证据）`grep -c '✓'` = **14**
- `w6-b7-01-demo-actions.log`（B7 原始证据）`grep -c '✓'` = **28**
- `w6-r4-02-assert.log`（R4 重跑+新增）`grep -c '✓'` = **20**
- `w6-r4-01-demo-actions.log`（R4 重跑+新增 legs 5b/7b/9/10）

## 2. 变更面 4 处失真的核实结论（W6-R4 Note「决策」末段记载）

| 指控 | 核实 | 结论 |
|---|---|---|
| `/scm/*` 路由未实施 | `grep -rln "'/scm\|\"/scm\|/scm/" examples/ demos/` 零命中 | 仓库确无 `/scm/*` 实现；B7 Note 范围行亦未声称——失真源于批次交接叙述 |
| `approval-rules.ts` 零改动 | `ls examples/kb-agent/scripts/` 无该文件 | 文件在仓库中不存在，「改过」为虚构 |
| `w6b4-bomver` 归属 | `demos/acceptance-w6/gates-b4.log:2448` `w6b4-bomver: assert PASS` | 归属 W6-B4 批次，非 B7 变更面 |
| assert 计数 | 见上 | 17/17 系误记，已修正 |

## 3. gates-b7.log 注明节选来源（文件头部追加）

> （注：本文件为节选——demo 段仅保留 leg 8 XSS 三项、assert 段仅保留终态三项。
> 完整断言清单见 w6-b7-01-demo-actions.log（28 项）与 w6-b7-assert.log（14 项）；
> W6-R4 修复轮的完整重跑与新增断言见 w6-r4-01-demo-actions.log / w6-r4-02-assert.log 与 gates-r4.log。）

## 4. w6b7-verify.mts:172 恒真断言 → 真实判定

原断言（恒真——xssMatrix 前一步已被用于取行，status 几乎必为 200）：

```ts
check('esc 由 JSBlock 渲染层负责（JSON 层无 HTML 求值）', xssMatrix.status === 200)
```

改为 DB 原文与矩阵 JSON 逐字节比对（证明 JSON 层既不求值也不转义，esc 职责留给渲染层；浏览器腿的 XSS 文本化渲染由截图另证）：

```ts
const dbRaw = psql(`SELECT name FROM srm_suppliers WHERE id = ${xssSupplierId};`).trim()
check('JSON 层原文往返（无 HTML 求值/转义，esc 归渲染层）', String(xssRow?.supplier_name) === dbRaw, `db=matrix=${dbRaw === String(xssRow?.supplier_name) ? 'identical' : 'DIFFER'}`)
```

实测输出（w6-r4-01-demo-actions.log leg 8）：`✓ JSON 层原文往返（无 HTML 求值/转义，esc 归渲染层） — db=matrix=identical`
