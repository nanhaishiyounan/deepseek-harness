# Agent Note: hub_po_suppliers 读视图——采购组页面与「待审核」枚举对齐

Status: implemented

[English](2026-09-25-po-supplier-read-view.md) | 中文

## 问题

mobile 对话登记真实落库 PG `hub_po_suppliers`（`mobile-form-assistant` preset 经 `nb_create` 写入；id=7~10 实测存在，`status=待审核`），但平台没有任何页面读这张表——所有既有「供应商」页面读的是 `hub_as_vendors` 或 `srm_suppliers`。两个叠加缺口：

1. **读视图缺位（P0 主因）。** `hub_po_suppliers` 全平台零页面；数据一直在库里，只是不可见。
2. **状态词汇错位（次因）。** preset 写 `status=待审核`，而集合 select 枚举只有 `active`/`inactive`——即便补了页面，以枚举为数据源的过滤器也会吞掉非枚举值。

完整诊断（文件:行号证据链）：[research/2026-09-25-w-round/00-p0-diagnosis.md](../../../../research/2026-09-25-w-round/00-p0-diagnosis.md)。

## 决策

**读视图走 F3 v2 flowPage 工厂，不新建 v1 页。** 平台既有 43 个表格页全部是 v2 flowPage，且批次验收要求 v2 页计数 43→44——路线由此钉死。`nocobase-hub-modules.mts` 承担菜单脚手架（新建「采购」组——B3 的 PR/PO 页面也落这里——加「采购供应商」页面条目与 v1 `PAGE_BLOCKS` 行），真正的页面由 `nocobase-f3-hub-v2.mts` 作为第 8 个 `HUB_PAGES` spec 拥有：`hub_po_suppliers` 上的一个 TableBlock、全字段的 Add-new 弹窗、提交动作、n18 AI 填写按钮。这复刻了平台其他页面走过的同一条三层 wire（v1 菜单行 + tabs wire → F3 rollback 记录后销毁 → 同 parentId 建 flowPage 树），没有引入新的页面构建风险。

**`待审核` 的枚举 value 用 preset 写入的中文原字面值，不用英文 key。** 既有行的值就是它；换成 `pending` 之类的成员会让存量四行匹配不上、渲染不出标签。选项追加为 `{ value: '待审核', label: '待审核', color: 'orange' }`——用 orange 而非计划里写的 amber，因为平台整套 select 词汇表说的是 antd 预设色（待执行=orange、待审批=orange），antd 没有 amber 预设。三处镜像保持同步：集合定义（全新安装）、`ENUM_ALIGNMENTS`（既有安装——append 式 `fields:update` 通道，值类型扩展出可选 `color`）、`fieldControls.ts` 的 `KNOWN_ENUMS`（mobile 草稿卡 select 控件）。

**列集保持在表的真实列内：name / contact_name / email / rating / status。** 批次文档的列清单含 `supplier_code`，但表没有这一列，persona 契约也写明 supplier_code 只在草稿系统生成区展示、永不落库（[`agent.cordis.yml`](../../../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml)「表中无列，只在草稿系统生成区展示，不写库」）。指向不存在字段的列会渲染空单元格（N14 field-key 教训）。

**verify 门禁校验词汇本身，而不只是页面存在。** `setup-nocobase.mts` 断言：F3 缺页清单含新页标题、`hub_po_suppliers.status` 枚举携带待审核（未来枚举回归会响亮失败而不是再次静默吞行）、n18ai- 下限 42→43 随新弹窗表单上调。

## 后果

供应商可见性现在有一个读 mobile 写入表的页面；三个「供应商」入口（资产管理·供应商读 `hub_as_vendors`、SRM 供应商档案读 `srm_suppliers`、采购供应商读 `hub_po_suppliers`）有意并存，直到 B2 把登记归一到 SRM 生命周期。「采购」菜单组是 B3 采购链页面的落点。preset 仍写待审核——对话登记的供应商确实待审核，语义正确；B2 的 SRM 接管将持有生命周期状态。`ENUM_ALIGNMENTS` 的值现在可带 `color`；不带 color 的 portal 词汇条目不受影响。

## 备选方案

**只建 v1 页（菜单 + uiSchemas 表格块）。** 否决：平台已没有 v1 表格页，批次验收本身按 v2 页计数 43→44，且 v1 页缺 Add-new 弹窗、n18 AI 按钮、邻页都有的 flowPage spine。

**加英文 `pending` 枚举成员并改写存量四行。** 否决：为迁就 schema 而改写用户可见数据，存量行存在错配窗口，相比匹配已写入字面值毫无收益。B2 在 SRM 接管时会整体重模生命周期状态。

**状态列渲染纯文本（不带枚举 options）。** 否决：文本能显示原值，但过滤器与 Add-new 表单失去词汇表；枚举才让列可筛选、标签有颜色。

## 证据

- `node --experimental-strip-types examples/kb-agent/scripts/setup-nocobase.mts verify` — OK（含新页、枚举、n18ai-≥43 断言）。
- psql：id=7~10 存在且待审核；flowPage 计数 44（[research/2026-09-25-w-round/b0-psql.txt](../../../../research/2026-09-25-w-round/b0-psql.txt)）。
- 浏览器：`b0-admin-supplier-page.png`（11 行，id=7~10 琥珀橙待审核标签、合作中绿/停用灰）、`b0-admin-addnew-enum.png`（Add-new 表单状态下拉列出 合作中/停用/待审核）、`b0-mobile-register.png`（对话登记→执行时间线→已落库）、`b0-mobile-receipt.png`（回执卡 №11、SUP-2026-0166、对话→确认→已落库 全绿）、`b0-admin-new-row.png`（刷新后第 11 行 B0测试食品 可见）。
- `pnpm vitest run packages/client/ui-mobile` — 613 测试全绿。
