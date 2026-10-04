// W7 audit round: read-only offline analyzer for the archived NocoBase JSON.
// Pure local replay of api-desktopRoutes.json / api-flowModels-flat.json (no network). Idempotent:
// overwrites audit-pages-w7.json / audit-routes-flat.md / audit-summary-w7.json next to this
// script. The flowModels archive is the flat /api/flowModels:list dump: one row per tree node;
// children reference parents by uid through parentId, and page trees root at each type=tabs route
// row's schemaUid. Unlike the W4 analyzer, tab children are NOT filtered to BlockGridModel so
// non-grid root blocks (JSBlockModel etc.) are kept, and root rows themselves are part of each
// page's row set. Calendar dates use Asia/Shanghai (UTC+8) because the milestone buckets are
// Shanghai work sessions.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ROUTES_FILE = 'api-desktopRoutes.json';
const MODELS_FILE = 'api-flowModels-flat.json';
const W4_ROUTES_FILE = '../2026-09-28-w4-completeness/api-desktopRoutes.json';
const W4_BASELINE = { total: 206, group: 16, page: 3, tabs: 95, flowPage: 92 };

const readArchive = (file) => JSON.parse(readFileSync(`${DIR}${file}`, 'utf8'));
const writeArtifact = (file, text) => {
  writeFileSync(`${DIR}${file}`, text.endsWith('\n') ? text : `${text}\n`);
  console.log(`wrote ${file} (${Buffer.byteLength(text, 'utf8')} bytes)`);
};

const routesArch = readArchive(ROUTES_FILE);
const modelsArch = readArchive(MODELS_FILE);
const routes = routesArch.data ?? [];
const models = modelsArch.data ?? [];
console.log(`loaded ${ROUTES_FILE}: ${routes.length} rows; ${MODELS_FILE}: ${models.length} rows`);

// Flow-model indexes: uid -> row and parent-uid -> child rows.
const byUid = new Map(models.map((r) => [r.uid, r]));
const byParent = new Map();
for (const r of models) {
  if (!r.parentId) continue;
  if (!byParent.has(r.parentId)) byParent.set(r.parentId, []);
  byParent.get(r.parentId).push(r);
}
const children = (uid) => byParent.get(uid) ?? [];

/** Depth-first closure of the subtree rooted at uid (exclusive), cycle-safe. */
function subtree(uid) {
  const seen = new Set();
  const stack = [...children(uid).map((c) => c.uid)];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const c of children(cur)) stack.push(c.uid);
  }
  return [...seen].map((u) => byUid.get(u));
}

const routeById = new Map(routes.map((r) => [r.id, r]));

/** Menu chain of a flowPage: group titles from the top-level group down to the direct parent. */
function groupChain(fp) {
  const titles = [];
  let cur = fp.parentId != null ? routeById.get(fp.parentId) : undefined;
  while (cur && cur.type === 'group') {
    titles.push(cur.title ?? '');
    cur = cur.parentId != null ? routeById.get(cur.parentId) : undefined;
  }
  return titles.reverse().join('/');
}

const flowPages = routes.filter((r) => r.type === 'flowPage');
const pageTabs = new Map();
for (const t of routes) {
  if (t.type !== 'tabs' || !flowPages.some((fp) => fp.id === t.parentId)) continue;
  if (!pageTabs.has(t.parentId)) pageTabs.set(t.parentId, []);
  pageTabs.get(t.parentId).push(t);
}
const flowPageTabsTotal = [...pageTabs.values()].reduce((a, ts) => a + ts.length, 0);
console.log(`flowPages: ${flowPages.length}; tabs under flowPages: ${flowPageTabsTotal}`);

// Per-page audit over the union of every tab child's subtree (roots inclusive, all uses kept).
const collectionOf = (row) => row?.stepParams?.resourceSettings?.init?.collectionName ?? null;
const pagePairs = [];
for (const fp of flowPages) {
  const tabs = pageTabs.get(fp.id) ?? [];
  const rowsById = new Map();
  for (const root of tabs.flatMap((t) => (t.schemaUid ? children(t.schemaUid) : []))) {
    if (!rowsById.has(root.uid)) rowsById.set(root.uid, root);
    for (const r of subtree(root.uid)) if (!rowsById.has(r.uid)) rowsById.set(r.uid, r);
  }
  const rows = [...rowsById.values()];
  const blocks = {};
  for (const r of rows) blocks[r.use] = (blocks[r.use] ?? 0) + 1;
  const tables = [];
  for (const tb of rows.filter((r) => r.use === 'TableBlockModel')) {
    const kids = children(tb.uid);
    tables.push({
      uid: tb.uid.slice(0, 6),
      collection: collectionOf(tb),
      filter: kids.some((k) => k.use === 'FilterActionModel'),
      columnCount: kids.filter((k) => k.use === 'TableColumnModel').length,
    });
  }
  pagePairs.push({
    fp,
    record: {
      title: fp.title ?? '',
      routeId: fp.id,
      schemaUid: fp.schemaUid ?? null,
      url: `/admin/${fp.schemaUid ?? ''}`,
      chain: groupChain(fp),
      createdAt: fp.createdAt ?? null,
      updatedAt: fp.updatedAt ?? null,
      blocks,
      tables,
      tabCount: tabs.length,
    },
  });
}

// Order pages by chain, then menu sort, then id (locale-stable chain comparison).
const cmpKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (typeof a[i] === 'string' || typeof b[i] === 'string') {
      const c = String(a[i]).localeCompare(String(b[i]));
      if (c !== 0) return c;
    } else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};
pagePairs.sort((x, y) => cmpKeys([x.record.chain, x.fp.sort ?? 0, x.fp.id ?? 0], [y.record.chain, y.fp.sort ?? 0, y.fp.id ?? 0]));
const pageRecords = pagePairs.map((p) => p.record);
writeArtifact('audit-pages-w7.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), pages: pageRecords }, null, 2)}\n`);

// Flat route table: one markdown section per type, every one of the 242 rows included.
const localDate = (iso) =>
  iso ? new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 10) : '-';
const mdCell = (v) => String(v ?? '').replaceAll('|', '\\|');
const flagsCell = (r) => {
  const hide = r.hideInMenu == null ? '-' : String(r.hideInMenu);
  const hidden = r.hidden == null ? '-' : String(r.hidden);
  return hide === '-' && hidden === '-' ? '-' : `${hide}/${hidden}`;
};
const uidCell = (r) => mdCell((r.schemaUid ?? '').slice(0, 10) || '-');
// group rows show their own title; every other row shows its ancestor group chain.
const chainOfRow = (r) => (r.type === 'group' ? (r.title ?? '') : groupChain(r));
const fpChain = new Map(flowPages.map((fp) => [fp.id, groupChain(fp)]));
const routeKey = (r) => {
  if (r.type === 'group') return [r.sort ?? 0, r.id ?? 0, ''];
  if (r.type === 'tabs') {
    const owner = r.parentId != null ? routeById.get(r.parentId) : undefined;
    return [owner?.sort ?? 0, r.sort ?? 0, r.id ?? 0, fpChain.get(owner?.id) ?? ''];
  }
  return [chainOfRow(r), r.sort ?? 0, r.id ?? 0];
};
const HEADER = '| type | title | chain | schemaUid | createdAt | hideInMenu/hidden |\n| --- | --- | --- | --- | --- | --- |';
const mdSections = ['group', 'flowPage', 'tabs', 'page'].map((type) => {
  const sectionRows = routes
    .filter((r) => r.type === type)
    .sort((a, b) => cmpKeys(routeKey(a), routeKey(b)))
    .map((r) => `| ${type} | ${mdCell(r.title ?? '')} | ${mdCell(chainOfRow(r))} | ${uidCell(r)} | ${localDate(r.createdAt)} | ${flagsCell(r)} |`);
  return `## ${type} (${sectionRows.length})\n\n${HEADER}\n${sectionRows.join('\n')}`;
});
const md = [
  `# W7 audit-routes-flat (${routes.length} rows)`,
  '',
  `source: ${ROUTES_FILE} (fetchedAt ${routesArch.fetchedAt ?? 'n/a'}); generatedAt ${new Date().toISOString()}`,
  '',
  mdSections.join('\n\n'),
  '',
].join('\n');
writeArtifact('audit-routes-flat.md', md);

// Summary aggregates; createdAt buckets are Asia/Shanghai calendar dates of the flowPage rows.
const typeCounts = routes.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {});
const bucketOf = (date) => {
  if (date < '2026-09-18') return 'pre-0918';
  if (date <= '2026-09-28') return '0918-0928';
  if (date <= '2026-09-30') return 'w5-0929-0930';
  return 'w6-1001-plus';
};
const createdAtBuckets = { 'pre-0918': 0, '0918-0928': 0, 'w5-0929-0930': 0, 'w6-1001-plus': 0 };
for (const fp of flowPages) createdAtBuckets[bucketOf(localDate(fp.createdAt))] += 1;
const chainCounts = new Map();
for (const fp of flowPages) chainCounts.set(groupChain(fp), (chainCounts.get(groupChain(fp)) ?? 0) + 1);
const groupChains = Object.fromEntries([...chainCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
const deltaVsW4 = {
  total: routes.length - W4_BASELINE.total,
  group: (typeCounts.group ?? 0) - W4_BASELINE.group,
  page: (typeCounts.page ?? 0) - W4_BASELINE.page,
  tabs: (typeCounts.tabs ?? 0) - W4_BASELINE.tabs,
  flowPage: (typeCounts.flowPage ?? 0) - W4_BASELINE.flowPage,
};

// New pages vs the W4 archive: flowPage schemaUids absent from the W4 flowPage set. A missing or
// unreadable W4 archive degrades to null instead of failing the whole run.
let newPagesVsW4 = null;
try {
  const w4Routes = readArchive(W4_ROUTES_FILE).data ?? [];
  const w4Uids = new Set(w4Routes.filter((r) => r.type === 'flowPage' && r.schemaUid).map((r) => r.schemaUid));
  newPagesVsW4 = pageRecords
    .filter((p) => !w4Uids.has(p.schemaUid))
    .map((p) => ({ schemaUid: p.schemaUid, title: p.title, chain: p.chain }));
  console.log(`W4 archive: ${w4Routes.length} rows, ${w4Uids.size} flowPage uids; new in W7: ${newPagesVsW4.length}`);
} catch (err) {
  console.error(`cannot read W4 archive ${W4_ROUTES_FILE} (${err.message}); newPagesVsW4 set to null`);
}

const summary = {
  totalRoutes: routes.length,
  typeCounts,
  flowPageCount: flowPages.length,
  groupChains,
  createdAtBuckets,
  w4Baseline: W4_BASELINE,
  deltaVsW4,
  newPagesVsW4,
};
writeArtifact('audit-summary-w7.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log('--- summary ---');
console.log(JSON.stringify(summary, null, 2));
