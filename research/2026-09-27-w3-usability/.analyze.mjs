// P0 read-only forensics step 3: page-to-wire mapping + global action stats + popup subtree probes.
// Reads api-desktopRoutes.json + api-flowModels-flat.json (both pulled full). Does GET-only probes:
//   /api/flowModels:findOne?parentId=<uid>&subKey=page  (HTTP 200 w/ data => popup subtree exists)
// Plus one POST /api/auth:signIn. Outputs routes-compact.md + evidence-table-wire.md.
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000';
const DIR = new URL('.', import.meta.url).pathname;
const prefix = (uid) => (uid ?? '').slice(0, 5);

const routes = JSON.parse(readFileSync(`${DIR}api-desktopRoutes.json`, 'utf8')).data;
const models = JSON.parse(readFileSync(`${DIR}api-flowModels-flat.json`, 'utf8')).data;

async function signIn() {
  const res = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  });
  const json = await res.json();
  if (!json?.data?.token) throw new Error(`signIn failed: HTTP ${res.status}`);
  return json.data.token;
}
const token = await signIn();

/** GET findOne; returns null when 204/empty (no such subtree), else parsed data. */
async function findOneSubtree(parentId, subKey) {
  const url = `${BASE}/api/flowModels:findOne?parentId=${encodeURIComponent(parentId)}&subKey=${encodeURIComponent(subKey)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const json = JSON.parse(text);
  return json?.data ?? null;
}

// ---------- indexes ----------
const routeById = new Map(routes.map((r) => [r.id, r]));
const routesByParent = new Map();
for (const r of routes) {
  const key = r.parentId ?? 0;
  if (!routesByParent.has(key)) routesByParent.set(key, []);
  routesByParent.get(key).push(r);
}
const modelsByParent = new Map();
for (const m of models) {
  if (!m.parentId) continue;
  if (!modelsByParent.has(m.parentId)) modelsByParent.set(m.parentId, []);
  modelsByParent.get(m.parentId).push(m);
}
const descendants = (uid) => {
  const out = [];
  const walk = (u) => {
    for (const c of modelsByParent.get(u) ?? []) { out.push(c); walk(c.uid); }
  };
  walk(uid);
  return out;
};
const groupChain = (route) => {
  const chain = [];
  let cur = route;
  while (cur?.parentId) {
    const p = routeById.get(cur.parentId);
    if (!p) break;
    chain.unshift(p.title || p.type);
    cur = p;
  }
  return chain.join(' / ');
};

const flowPages = routes.filter((r) => r.type === 'flowPage').sort((a, b) => (groupChain(a).localeCompare(groupChain(b)) || a.id - b.id));

// ---------- routes-compact.md ----------
{
  const lines = ['# routes-compact — 80 flowPage rows (from api-desktopRoutes.json, 180 rows total)', '',
    '| route id | title | type | schemaUid | uid prefix | parent group chain | tabs |',
    '|---|---|---|---|---|---|---|'];
  for (const fp of flowPages) {
    const tabs = (routesByParent.get(fp.id) ?? []).filter((r) => r.type === 'tabs');
    lines.push(`| ${fp.id} | ${fp.title} | ${fp.type} | ${fp.schemaUid} | ${prefix(fp.schemaUid)} | ${groupChain(fp)} | ${tabs.length} |`);
  }
  writeFileSync(`${DIR}routes-compact.md`, `${lines.join('\n')}\n`);
}

// ---------- page → grid → blocks ----------
const collectionOf = (m) => m?.stepParams?.resourceSettings?.init?.collectionName
  ?? m?.stepParams?.popupSettings?.openView?.collectionName
  ?? m?.props?.collectionName ?? null;

const pages = [];
for (const fp of flowPages) {
  const tabs = (routesByParent.get(fp.id) ?? []).filter((r) => r.type === 'tabs');
  const entryGrids = tabs.flatMap((t) => models.filter((m) => m.parentId === t.schemaUid && m.use === 'BlockGridModel'));
  const nodes = [];
  for (const g of entryGrids) nodes.push(g, ...descendants(g.uid));
  const blocks = nodes.filter((n) => ['TableBlockModel', 'KanbanBlockModel', 'CalendarBlockModel', 'ChartBlockModel', 'DetailsBlockModel', 'JSBlockModel', 'AIChatBoxBlockModel'].includes(n.use));
  pages.push({ route: fp, tabs, entryGrids, nodes, blocks });
}

// ---------- per-page table rows + live probes ----------
const rowCells = [];
const anomalies = [];
let addNewOk = 0, addNewMissing = 0;
for (const p of pages) {
  const tableBlocks = p.blocks.filter((b) => b.use === 'TableBlockModel');
  const otherBlocks = p.blocks.filter((b) => b.use !== 'TableBlockModel');
  if (tableBlocks.length === 0 && otherBlocks.length === 0) anomalies.push(`page "${p.route.title}" (${p.route.schemaUid}): no entry BlockGridModel under tabs schemaUid — unwired?`);
  for (const tb of tableBlocks) {
    const cols = (modelsByParent.get(tb.uid) ?? []).filter((m) => m.subKey === 'columns');
    const acts = (modelsByParent.get(tb.uid) ?? []).filter((m) => m.subKey === 'actions');
    const hasActionsCol = cols.some((c) => c.use === 'TableActionsColumnModel');
    const viewish = acts.filter((a) => /View|Edit|Delete/i.test(a.use)).map((a) => a.use);
    const colActNodes = cols.flatMap((c) => (modelsByParent.get(c.uid) ?? []));
    const viewishInCol = colActNodes.filter((a) => /View|Edit|Delete/i.test(a.use)).map((a) => a.use);
    const addNews = acts.filter((a) => a.use === 'AddNewActionModel');
    const popupChecks = [];
    for (const an of addNews) {
      const sub = await findOneSubtree(an.uid, 'page');
      const ok = sub != null;
      ok ? addNewOk++ : addNewMissing++;
      popupChecks.push(`${an.uid}:${ok ? 'yes' : 'MISSING'}`);
    }
    rowCells.push({
      page: p.route.title,
      schemaUid: p.route.schemaUid,
      prefix: prefix(p.route.schemaUid),
      collection: collectionOf(tb),
      blockUid: tb.uid,
      hasActionsCol: hasActionsCol ? 'yes' : 'no',
      actionsUses: acts.map((a) => a.use).join(', ') || '(none)',
      viewish: [...new Set([...viewish, ...viewishInCol])].join(', ') || 'no',
      addNew: addNews.length ? addNews.map((a) => a.uid).join(',') : 'no',
      addNewPopup: popupChecks.join(' ') || 'n/a',
      otherBlocks: otherBlocks.map((b) => b.use).join(',') || '',
    });
  }
  if (tableBlocks.length === 0) {
    rowCells.push({
      page: p.route.title, schemaUid: p.route.schemaUid, prefix: prefix(p.route.schemaUid),
      collection: '(no table block)', blockUid: '', hasActionsCol: 'n/a', actionsUses: 'n/a',
      viewish: 'n/a', addNew: 'n/a', addNewPopup: 'n/a',
      otherBlocks: otherBlocks.map((b) => `${b.use}(${collectionOf(b) ?? ''})`).join(',') || '(empty page?)',
    });
  }
}

// orphan grids: BlockGridModel rows not reachable from any tab schemaUid. Verified shape: 83 top-level
// grids with NO children and NO tabs reference — factory-batch shell registration rows (like the 213
// RouteModel rows), not page anomalies. Only child-bearing unreachable grids would be real anomalies.
const reachable = new Set();
for (const p of pages) for (const n of p.nodes) reachable.add(n.uid);
let shellGrids = 0;
for (const m of models) {
  if (m.use === 'BlockGridModel' && !m.parentId && !reachable.has(m.uid)) {
    if ((modelsByParent.get(m.uid) ?? []).length === 0) { shellGrids++; continue; }
    anomalies.push(`orphan top-level BlockGridModel ${m.uid} (prefix ${prefix(m.uid)}) with children but unreachable from any tabs route`);
  }
}

// ---------- global action stats ----------
const actionStats = {};
for (const m of models) {
  if (!m.use) continue;
  if (m.use.endsWith('ActionModel') || m.use === 'TableActionsColumnModel') {
    actionStats[m.use] ??= { count: 0, prefixes: {} };
    actionStats[m.use].count += 1;
    const pfx = prefix(m.uid);
    actionStats[m.use].prefixes[pfx] = (actionStats[m.use].prefixes[pfx] ?? 0) + 1;
  }
}

// ---------- kanban/calendar drawer subtree probes ----------
const drawerProbes = [];
for (const m of models.filter((x) => x.use === 'KanbanCardViewActionModel' || x.use === 'CalendarEventViewActionModel')) {
  const sub = await findOneSubtree(m.uid, 'page');
  drawerProbes.push({ use: m.use, uid: m.uid, prefix: prefix(m.uid), pageSubtree: sub ? 'present' : 'MISSING (204)' });
}

// ---------- evidence-table-wire.md ----------
{
  const L = [];
  L.push('# evidence-table-wire — flowPage → grid → blocks wiring (P0 forensics)', '',
    `- base: ${BASE} (see .fetch-core.mjs header note: :3080 has no /api; real server is :13000)`,
    `- flowPages: ${flowPages.length}; flowModel rows: ${models.length}; TableBlockModel rows: ${models.filter((m) => m.use === 'TableBlockModel').length}`,
    `- wiring: desktopRoutes(flowPage).id → tabs route (type=tabs) → tabs.schemaUid == BlockGridModel.parentId (verified for ${pages.filter((p) => p.entryGrids.length > 0).length}/${flowPages.length} pages)`,
    '', '## (a) hierarchy rule', '',
    '`flowPage route --(route.parentId=id)--> tabs route --(flowModel.parentId = tabs.schemaUid)--> BlockGridModel --(subKey=items)--> Table/Kanban/Calendar/Chart blocks --(subKey=columns/actions)--> columns & actions`',
    '', `## (b) per-page wiring (${rowCells.length} rows)`, '',
    '| page | collection | block (Table unless noted) | actionsCol? | actions uses | view/edit/delete actions | addNew | addNew popup subtree |',
    '|---|---|---|---|---|---|---|---|');
  for (const r of rowCells) {
    L.push(`| ${r.page} [${r.prefix}] | ${r.collection ?? '?'} | ${r.otherBlocks ? `+${r.otherBlocks}` : 'table'} | ${r.hasActionsCol} | ${r.actionsUses} | ${r.viewish} | ${r.addNew} | ${r.addNewPopup} |`);
  }
  L.push('', `AddNew popup subtrees: present=${addNewOk}, missing=${addNewMissing}`, '',
    '## (c) global action-model stats (all 3700 flowModel rows)', '',
    '| use | count | uid prefixes |', '|---|---|---|');
  for (const [use, s] of Object.entries(actionStats).sort((a, b) => b[1].count - a[1].count)) {
    L.push(`| ${use} | ${s.count} | ${Object.entries(s.prefixes).map(([k, v]) => `${k}×${v}`).join(', ')} |`);
  }
  L.push('', '## (d) kanban/calendar drawer subtree probes (f1 fix online?)', '',
    '| use | uid | prefix | page subtree |', '|---|---|---|---|');
  for (const d of drawerProbes) L.push(`| ${d.use} | ${d.uid} | ${d.prefix} | ${d.pageSubtree} |`);
  // page-type classification summary
  const withTable = pages.filter((p) => p.blocks.some((b) => b.use === 'TableBlockModel'));
  const kanbanOnly = pages.filter((p) => p.blocks.some((b) => b.use === 'KanbanBlockModel') && !p.blocks.some((b) => b.use === 'TableBlockModel'));
  const calOnly = pages.filter((p) => p.blocks.some((b) => b.use === 'CalendarBlockModel') && !p.blocks.some((b) => b.use === 'TableBlockModel') && !p.blocks.some((b) => b.use === 'KanbanBlockModel'));
  const tablesWithActionsColOrRowView = rowCells.filter((r) => r.hasActionsCol === 'yes' || (r.viewish !== 'no' && r.viewish !== 'n/a'));
  L.push('', '## page-type summary', '',
    `- flowPages: ${pages.length}; with ≥1 TableBlockModel: ${withTable.length}; kanban-only: ${kanbanOnly.length}; calendar-only: ${calOnly.length}; other/no-block: ${pages.length - withTable.length - kanbanOnly.length - calOnly.length}`,
    `- table block rows: ${models.filter((m) => m.use === 'TableBlockModel').length} across ${withTable.length} pages; kanban blocks: ${models.filter((m) => m.use === 'KanbanBlockModel').length}; calendar blocks: ${models.filter((m) => m.use === 'CalendarBlockModel').length}`,
    `- table rows WITH TableActionsColumnModel or row-level view/edit/delete action: ${tablesWithActionsColOrRowView.length} (expected 0)`,
    `- shell BlockGridModel registration rows (no children, unreferenced): ${shellGrids}; RouteModel registration rows: ${models.filter((m) => !m.use && m.schema?.use === 'RouteModel').length}`);
  if (anomalies.length) {
    L.push('', '## anomalies', '', ...anomalies.map((a) => `- ${a}`));
  }
  writeFileSync(`${DIR}evidence-table-wire.md`, `${L.join('\n')}\n`);
}

console.log(`pages=${flowPages.length} tableRows=${rowCells.length} addNewOk=${addNewOk} addNewMissing=${addNewMissing} anomalies=${anomalies.length}`);
console.log('drawer probes:', JSON.stringify(drawerProbes));
