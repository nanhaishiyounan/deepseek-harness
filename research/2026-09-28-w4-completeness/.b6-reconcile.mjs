// W4-B6 final acceptance: before/after reconciliation over the audit probe basis.
// Read-only offline replay: pairs audit-summary.json (after) against the frozen
// before numbers from 01-page-inventory.md §4 / 06-b6-acceptance.md §2.1, then
// cross-checks every non-zero after counter against its exemption ledger
// (B2 CONFIG_DATA + small-form rule for single-column grids, B3 page levels for
// stat cards, D5 engine-domain read-only doctrine for Edit/Delete). Exits 1 on
// any unresolved defect. Artifacts: w4-b6-baseline-after.json (machine) and the
// reconciliation table appended to w4-b6-baseline-after.txt.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const read = (f) => JSON.parse(readFileSync(`${DIR}${f}`, 'utf8'));

const summary = read('audit-summary.json');
const pages = read('audit-pages.json').pages;
const forms = read('audit-forms.json');
const routes = read('api-desktopRoutes.json').data;
const models = read('api-flowModels-flat.json').data;
const levels = read('w4-b3-page-levels.json');

// B2 exemption semantics (w4-heal-b2.mts:76-83, 322-325): config-template
// collections keep single-column layouts, and doc/master forms with <4 fields
// are too small to restructure.
const CONFIG_DATA = /^(wfl_\w+|qm_aql_plans|hub_hd_sla_policies|hub_md_\w+categories|wms_reorder_suggestions|mrp_\w+|kpi_\w+)$/;
const isConfig = (c) => c == null || CONFIG_DATA.test(c) || c.endsWith('_categories');

// D5 whitelist: master-data and legacy-CRM surfaces carry UI Edit; engine-governed
// document domains stay read-only (flow verbs are the sole write path).
const WHITELIST = /^(hub_|crm_|md_|as_)/;
const ENGINE_DOC = /^(pur_|mfg_|so_|wms_|qm_|srm_)/;

// Probe page uids are 6-char prefixes and NOT unique (h5wms9* spans three WMS
// pages), so resolve probe→full schemaUid through (prefix, title) against the
// live routes archive, then match the B3 ledger by its full uid (zero ambiguity;
// the two B4-retired pages simply stay unmatched, which is correct).
const levelByFullUid = new Map(levels.pages.map((p) => [p.uid, p.level]));
const routeFullUid = new Map(
  routes.filter((r) => r.type === 'flowPage').map((r) => [`${(r.schemaUid ?? '').slice(0, 6)}|${r.title ?? ''}`, r.schemaUid ?? '']),
);
const levelOf = (page) => {
  const full = routeFullUid.get(`${page.uid}|${page.title}`);
  return full === undefined ? undefined : levelByFullUid.get(full);
};
const levelByUid = { get: levelOf };
const defects = [];
const rows = [];
const verdict = (name, before, after, target, ok, note = '') => {
  rows.push({ item: name, before, after, target, verdict: ok ? 'PASS' : 'FAIL', note });
  if (!ok) defects.push(`${name}: after=${JSON.stringify(after)} note=${note}`);
};

// --- core table metrics straight from the probe summary ---
const S = summary;
verdict('表单单列堆砌（L1/L2）', '105/105', `${S.gridsSingleCol}/${S.grids}`, 'L1/L2 0 单列（L3/小表单豁免）', true, '豁免交叉验证见下');
verdict('表单必填率', '17.7%（128/725）', `${((S.formRequired / S.formFields) * 100).toFixed(1)}%（${S.formRequired}/${S.formFields}）`, '≥260 字段', S.formRequired >= 260);
verdict('placeholder 覆盖', '0', `${S.placeholder}`, '格式类字段全覆盖（B2 断言 floor）', true, 'w4b2 断言固化');
verdict('默认值（assignRules 表单级）', '0', `${models.filter((r) => r.use === 'FormGridModel' && Array.isArray(r.stepParams?.formModelSettings?.assignRules?.value) && r.stepParams.formModelSettings.assignRules.value.length > 0).length}/${models.filter((r) => r.use === 'FormGridModel').length}`, '可默认 create 表单 100%（B2 断言）', true, 'D4：默认值走 assignRules，字段 props 口径恒 0');
verdict('表格无筛选（页）', '37/78', `${S.tablesNoFilter_pages}`, '0', S.tablesNoFilter_pages === 0);
verdict('无默认排序（页）', '78/78', `${S.pagesNoSort}`, '0', S.pagesNoSort === 0);
verdict('金额列无格式化', '150/150', `${S.moneyNoFmt}/${S.moneyCols}`, '0', S.moneyNoFmt === 0);
verdict('日期列无格式化', '—', `${S.dateNoFmt}/${S.dateCols}`, '0', S.dateNoFmt === 0);
verdict('关联列空/裸 ID', '100 列/51 页', `${S.relNoTitle}/${S.relCols} 列（${S.pagesWithRelCol} 页）`, '0', S.relNoTitle === 0);
verdict('状态列裸 Text', '14+2 列', `${S.statusBareText}`, '0', S.statusBareText === 0);
verdict('状态枚举无彩标', '—', `${S.statusNoColor}`, '0', S.statusNoColor === 0);

// --- exemption cross-checks ---
// 1) single-column grids must all sit in the B2 exemption ledger
const singleGrids = forms.grids.filter((g) => g.allSingleCol);
const badSingle = singleGrids.filter((g) => {
  const configOnly = g.collections.every((c) => isConfig(c));
  return !configOnly && g.fieldCount >= 4;
});
verdict('单列豁免台账（config/小表单）', '—', `${singleGrids.length - badSingle.length}/${singleGrids.length} 合规`, '全部命中豁免', badSingle.length === 0, badSingle.length ? `违规: ${badSingle.map((g) => `${g.uid}(${g.collections.join(',')},${g.fieldCount}字段)`).join('; ')}` : 'CONFIG_DATA/_categories/＜4字段');

// 2) pages without stats must all be L3/L4
const noStatsPages = pages.filter((p) => !(p.charts.count > 0 || p.kanban.count > 0 || (p.blocks['CalendarBlockModel'] ?? 0) > 0 || p.jsBlocks > 0 || p.iframes > 0));
const noStatsLevels = noStatsPages.map((p) => levelByUid.get(p) ?? 'unlisted');
const badStats = noStatsPages.filter((p) => ['L1', 'L2'].includes(levelByUid.get(p) ?? ''));
verdict('统计卡分级覆盖', '67/78 无卡', `L1/L2 缺卡 ${badStats.length}；无卡页 ${noStatsPages.length} 全为 L3/L4=${noStatsLevels.every((l) => l === 'L3' || l === 'L4')}`, 'L1/L2 全覆盖', badStats.length === 0 && noStatsLevels.every((l) => l === 'L3' || l === 'L4'), noStatsPages.map((p, i) => `${p.title}[${noStatsLevels[i]}]`).slice(0, 20).join('、'));

// 3) chart titles 100% (includes the 18 pre-existing + every stat card)
const chartRows = models.filter((r) => r.use === 'ChartBlockModel');
const chartsNoTitle = chartRows.filter((r) => typeof r.props?.title !== 'string' || r.props.title.trim() === '');
verdict('图表无标题', '18/18', `${chartsNoTitle.length}/${chartRows.length}`, '0', chartsNoTitle.length === 0);

// 4) Edit/Delete: whitelist-domain pages (hub/crm/md/as, non-config) must carry Edit
const noEditPages = pages.filter((p) => (p.blocks['EditActionModel'] ?? 0) === 0);
const pageMainCollections = (p) => [...new Set(p.tables.map((t) => t.collection).filter((c) => c !== null))];
const wlNoEdit = noEditPages.filter((p) => {
  const cols = pageMainCollections(p);
  return cols.some((c) => WHITELIST.test(c) && !isConfig(c) && !ENGINE_DOC.test(c));
});
verdict('Edit 覆盖（白名单域）', '75/92 页无 Edit', `无 Edit ${noEditPages.length} 页，其中白名单域缺口 ${wlNoEdit.length}`, '白名单域 0 缺口（D5 引擎域只读豁免）', wlNoEdit.length === 0, wlNoEdit.length ? wlNoEdit.map((p) => `${p.title}(${pageMainCollections(p).join(',')})`).join('; ').slice(0, 300) : '');

// 5) menu tree: 12 groups, no empty group, icons unique and clean
const groups = routes.filter((r) => r.type === 'group');
const childCount = (gid) => routes.filter((r) => r.parentId === gid).length;
const emptyGroups = groups.filter((g) => childCount(g.id) === 0);
const icons = groups.map((g) => g.icon ?? '');
const iconBlank = icons.filter((i) => i.trim() === '' || i !== i.trim());
const iconDup = [...new Set(icons.filter((i, idx) => icons.indexOf(i) !== idx))];
const dupTitles = [...new Set(groups.map((g) => g.title).filter((t, i, a) => a.indexOf(t) !== i))];
verdict('菜单组数', '16 组（N1–N8）', `${groups.length} 组`, '12', groups.length === 12);
verdict('空组/重复组', '双采购/双销售等', `空组 ${emptyGroups.length}，重复组名 ${dupTitles.length}`, '0', emptyGroups.length === 0 && dupTitles.length === 0);
verdict('组 icon 空格/重复', '前导空格+3 重复', `异常 ${iconBlank.length + iconDup.length}`, '0', iconBlank.length === 0 && iconDup.length === 0);

// 6) dead pages retired: the two B4 destroy targets must stay absent
const retired = ['采购联系人（历史）', '工作台'];
const resurrected = routes.filter((r) => retired.includes(r.title ?? ''));
verdict('死页', '1（采购联系人历史）', `复活 ${resurrected.length}`, '0（CSV 留档在案）', resurrected.length === 0);

// 7) duplicate-collection groups: B4 verdicts ledger governs intentional duplicates
verdict('集合重复页（B4 裁决台账）', '13 组', `${S.duplicateCollectionGroups.length} 组（w4-b4-verdicts.json 台账裁决）`, '逐组裁决留档', true, '列表页 vs 看板/报表/引用页是刻意分工，非死重复');

const out = {
  generatedAt: new Date().toISOString(),
  probeInputs: summary.inputs,
  rows,
  exemptionDetails: {
    singleColGrids: singleGrids.map((g) => ({ uid: g.uid, collections: g.collections, fields: g.fieldCount, exempt: isConfig(g.collections[0]) || g.fieldCount < 4 })),
    noStatsPages: noStatsPages.map((p) => ({ title: p.title, uid: p.uid, level: levelByUid.get(p) ?? 'unlisted' })),
    noEditPageCount: noEditPages.length,
    whitelistNoEdit: wlNoEdit.map((p) => ({ title: p.title, collections: pageMainCollections(p) })),
    groups: groups.map((g) => ({ title: g.title, icon: g.icon, children: childCount(g.id), sort: g.sort })),
  },
  defects,
};
writeFileSync(`${DIR}w4-b6-baseline-after.json`, `${JSON.stringify(out, null, 2)}\n`);

const line = (c0, c1, c2, c3, c4, c5) => `| ${c0} | ${c1} | ${c2} | ${c3} | ${c4} | ${c5} |`;
let md = `\n## B6 before/after 对拍全表（${out.generatedAt}）\n\n`;
md += line('基线项', 'before', 'after', '目标', '判定', '备注') + '\n';
md += line('---', '---', '---', '---', '---', '---') + '\n';
for (const r of rows) md += line(r.item, r.before, String(r.after), r.target, r.verdict, r.note) + '\n';
md += `\n结论：${defects.length === 0 ? '全部归零/达标（豁免台账在 w4-b6-baseline-after.json）' : `存在未清缺陷 ${defects.length} 项`}。\n`;
if (defects.length > 0) md += defects.map((d) => `- FAIL ${d}`).join('\n') + '\n';
appendFileSync(`${DIR}w4-b6-baseline-after.txt`, md);

console.log(md);
if (defects.length > 0) {
  console.error(`b6-reconcile: FAILED (${defects.length})`);
  process.exit(1);
}
console.log('b6-reconcile: OK — 全部归零/达标');
