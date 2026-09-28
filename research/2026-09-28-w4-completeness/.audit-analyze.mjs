// W4 completeness round: read-only offline analyzer for the archived NocoBase JSON.
// Pure local replay of api-desktopRoutes.json / api-flowModels-flat.json / api-collection-fields.json
// (no network). Idempotent: overwrites audit-pages.json / audit-forms.json / audit-summary.json
// next to this script. The flowModels archive is the flat /api/flowModels:list dump: one row per
// tree node; children reference parents by uid through parentId, page trees root at each
// type=tabs route row's schemaUid (a uid of a childless top-level {uid,name,schema:{use:'RouteModel'}}
// row), and popup-borne forms/details (FormGridModel, CreateFormModel, ChildPageTabModel, ...) are
// rootless and therefore audited globally instead of per page.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const INPUTS = ['api-desktopRoutes.json', 'api-flowModels-flat.json', 'api-collection-fields.json'];

const sha256 = (file) => createHash('sha256').update(readFileSync(`${DIR}${file}`)).digest('hex');
const readArchive = (file) => JSON.parse(readFileSync(`${DIR}${file}`, 'utf8'));
const writeArtifact = (file, value) => {
  writeFileSync(`${DIR}${file}`, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${file}`);
};

const routesArch = readArchive(INPUTS[0]);
const modelsArch = readArchive(INPUTS[1]);
const fieldsArch = readArchive(INPUTS[2]);
const routes = routesArch.data ?? [];
const models = modelsArch.data ?? [];
const fields = fieldsArch.data ?? [];

// Rule 1: relation-field set. A field is relational when target is non-empty or its interface
// matches the m2o/o2o/m2m/o2m family.
const rel = new Map();
for (const f of fields) {
  if ((f.target ?? '') !== '' || /^(m2o|o2o|m2m|o2m)/.test(f.interface ?? '')) {
    if (!rel.has(f.collectionName)) rel.set(f.collectionName, new Set());
    rel.get(f.collectionName).add(f.name);
  }
}

// Flow-model indexes: uid -> row and parent-uid -> child rows.
const byUid = new Map(models.map((r) => [r.uid, r]));
const byParent = new Map();
for (const r of models) {
  if (!r.parentId) continue;
  if (!byParent.has(r.parentId)) byParent.set(r.parentId, []);
  byParent.get(r.parentId).push(r);
}
const children = (uid) => byParent.get(uid) ?? [];
const bySort = (rows) => [...rows].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

/** Depth-first closure of the subtree rooted at uid (inclusive), cycle-safe. */
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

// Rule 2: per-page audit over the tree reachable from each tab's BlockGrid roots.
const collectionOf = (row) => row?.stepParams?.resourceSettings?.init?.collectionName ?? null;
const pageRecords = [];
for (const fp of flowPages) {
  const tabs = pageTabs.get(fp.id) ?? [];
  const roots = tabs.flatMap((t) => children(t.schemaUid).filter((c) => c.use === 'BlockGridModel'));
  const rows = roots.flatMap((r) => subtree(r.uid));
  const blocks = {};
  for (const r of rows) blocks[r.use] = (blocks[r.use] ?? 0) + 1;
  const tables = [];
  // W4-B1: a live filterManager connection to a table counts as filtered
  // (built from the global archive: the page subtree excludes the grid itself)
  const gridFilterTargets = new Set();
  for (const g of models.filter((r) => r.use === 'BlockGridModel' && Array.isArray(r.filterManager))) {
    for (const config of g.filterManager) gridFilterTargets.add(String(config?.targetId ?? ''));
  }
  for (const tb of rows.filter((r) => r.use === 'TableBlockModel')) {
    const kids = children(tb.uid);
    const filter = kids.some((k) => k.use === 'FilterActionModel') || gridFilterTargets.has(tb.uid);
    // W4-B1: globalSort is the render-side key the table reads back
    const sort = tb.props?.globalSort ?? tb.props?.params?.sort ?? tb.stepParams?.resourceSettings?.init?.params?.sort ?? null;
    const actions = bySort(kids.filter((k) => k.subKey === 'actions')).map((k) => k.use);
    const rowActions = bySort(kids.filter((k) => k.use === 'TableActionsColumnModel'))
      .flatMap((k) => bySort(children(k.uid).filter((c) => c.subKey === 'actions')).map((c) => c.use));
    const columns = bySort(kids.filter((k) => k.subKey === 'columns' && k.use === 'TableColumnModel')).map((col) => {
      const child = children(col.uid).find((k) => k.subKey === 'field') ?? null;
      const opts = child?.props?.options ?? col.props?.options ?? null;
      const init = col.stepParams?.fieldSettings?.init ?? null;
      const fieldMeta = init != null ? (fields.find((f) => f.collectionName === init.collectionName && f.name === init.fieldPath)) : undefined;
      return {
        title: col.props?.title ?? null,
        dataIndex: col.props?.dataIndex ?? null,
        fieldUse: child?.use ?? null,
        options: Array.isArray(opts) ? opts.map((o) => ({ label: o.label ?? null, color: o.color ?? null })) : null,
        numberFormat: child?.use === 'DisplayNumberFieldModel' ? (child.props?.numberFormat ?? null) : null,
        separator: child?.use === 'DisplayNumberFieldModel' ? (child.props?.separator ?? null) : null,
        precision: child?.use === 'DisplayNumberFieldModel' ? (child.props?.precision ?? null) : null,
        format: child?.use === 'DisplayDateTimeFieldModel' ? (child.props?.format ?? child.props?.dateFormat ?? null) : null,
        titleField: child?.props?.titleField ?? col.stepParams?.tableColumnSettings?.fieldNames?.label ?? null,
        identifier: init != null && (init.fieldPath === 'id' || /_id$/.test(init.fieldPath) || fieldMeta?.interface === 'id'),
        selectField: fieldMeta?.interface === 'select',
        rel: init != null && (rel.get(init.collectionName)?.has(init.fieldPath) ?? false),
      };
    });
    tables.push({ uid: tb.uid.slice(0, 6), collection: collectionOf(tb), filter, sort, actions, rowActions, columns });
  }
  const blockUseList = (use) => rows.filter((r) => r.use === use);
  const blockCollections = (use) => [...new Set(blockUseList(use).map(collectionOf).filter((c) => c !== null))];
  pageRecords.push({
    title: fp.title ?? '',
    uid: (fp.schemaUid ?? '').slice(0, 6),
    chain: groupChain(fp),
    blocks,
    tables,
    kanban: { count: blockUseList('KanbanBlockModel').length, collections: blockCollections('KanbanBlockModel') },
    charts: { count: blockUseList('ChartBlockModel').length, collections: blockCollections('ChartBlockModel') },
    jsBlocks: blockUseList('JSBlockModel').length,
    iframes: blockUseList('IframeBlockModel').length,
    aiChat: blockUseList('AIChatBoxBlockModel').length,
  });
}

// Rule 3: global form audit. FormGridModel rows are rootless (popup-borne), so grids are audited
// across the whole archive and fields are resolved through layout.rows[].cells[].items[] uids.
const formGrids = models.filter((r) => r.use === 'FormGridModel');
const gridRecords = [];
for (const fg of formGrids) {
  const layout = fg.props?.layout ?? fg.stepParams?.gridSettings?.grid?.layout ?? {};
  const rows = layout.rows ?? [];
  const allSingleCol = rows.length > 0 && rows.every((row) => Array.isArray(row.sizes) && row.sizes.length === 1 && row.sizes[0] === 24);
  const fieldItems = [];
  for (const row of rows) {
    for (const cell of row.cells ?? []) {
      for (const uid of cell.items ?? []) {
        const it = byUid.get(uid);
        if (it?.use === 'FormItemModel') fieldItems.push(it);
      }
    }
  }
  const fieldsOf = fieldItems.map((it) => {
    const init = it.stepParams?.fieldSettings?.init ?? {};
    return {
      fieldPath: init.fieldPath ?? null,
      collectionName: init.collectionName ?? null,
      required: it.props?.required === true,
    };
  });
  gridRecords.push({
    uid: fg.uid.slice(0, 6),
    rows: rows.length,
    allSingleCol,
    collections: [...new Set(fieldsOf.map((f) => f.collectionName).filter((c) => c !== null))],
    fieldCount: fieldsOf.length,
    requiredCount: fieldsOf.filter((f) => f.required).length,
    fields: fieldsOf,
  });
}

// Rule 4: global field-model stats over non-Display *FieldModel rows.
let placeholder = 0;
let defaultValue = 0;
let fieldEmptyProps = 0;
let fieldModels = 0;
for (const r of models) {
  if (!r.use || !r.use.endsWith('FieldModel') || r.use.startsWith('Display')) continue;
  fieldModels++;
  const p = r.props;
  const isEmpty = p == null || (typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0);
  if (isEmpty) fieldEmptyProps++;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    if (typeof p.placeholder === 'string' ? p.placeholder !== '' : p.placeholder != null) placeholder++;
    if (typeof p.defaultValue === 'string' ? p.defaultValue !== '' : p.defaultValue != null) defaultValue++;
  }
}

// Summary aggregates (independent recomputation; the task pins the browser-side reference numbers).
const pagesWith = (pred) => pageRecords.filter(pred).length;
const allTables = pageRecords.flatMap((p) => p.tables);
const tablesNoFilter = allTables.filter((t) => !t.filter);
const pagesNoFilterAll = pageRecords.filter((p) => p.tables.length > 0 && p.tables.every((t) => !t.filter));
const pagesNoSort = pageRecords.filter((p) => p.tables.length > 0 && p.tables.every((t) => t.sort === null));
const moneyColumns = allTables.flatMap((t) => t.columns.filter((c) => c.fieldUse === 'DisplayNumberFieldModel' && !c.identifier));
const relColumns = allTables.flatMap((t) => t.columns.filter((c) => c.rel));
const dateColumns = allTables.flatMap((t) => t.columns.filter((c) => c.fieldUse === 'DisplayDateTimeFieldModel'));
const statusBare = allTables.flatMap((t) => t.columns.filter((c) => c.fieldUse === 'DisplayTextFieldModel' && c.selectField));
const statusNoColorColumns = allTables.flatMap((t) => t.columns.filter((c) => c.fieldUse === 'DisplayEnumFieldModel' && Array.isArray(c.options) && (c.options.length === 0 || c.options.some((o) => o.color == null))));
const colPageCount = new Map();
for (const p of pageRecords) {
  for (const c of new Set(p.tables.map((t) => t.collection).filter((c) => c !== null))) {
    colPageCount.set(c, (colPageCount.get(c) ?? 0) + 1);
  }
}
const duplicateGroups = [...colPageCount.entries()]
  .filter(([, n]) => n > 1)
  .map(([collection, pages]) => ({ collection, pages }))
  .sort((a, b) => b.pages - a.pages || a.collection.localeCompare(b.collection));
const hasUse = (p, use) => (p.blocks[use] ?? 0) > 0;

writeArtifact('audit-pages.json', { generatedFrom: INPUTS, pages: pageRecords });
writeArtifact('audit-forms.json', {
  generatedFrom: INPUTS,
  grids: gridRecords,
  fieldModelStats: { nonDisplayFieldModels: fieldModels, placeholder, defaultValue, emptyProps: fieldEmptyProps },
});

const summary = {
  pages: pageRecords.length,
  pagesWithTable: pagesWith((p) => p.tables.length > 0),
  totalTableBlocks: allTables.length,
  tablesNoFilter_pages: pagesNoFilterAll.length,
  tablesNoFilter_blocks: tablesNoFilter.length,
  pagesNoSort: pagesNoSort.length,
  pagesKanban: pagesWith((p) => p.kanban.count > 0),
  pagesCalendar: pagesWith((p) => (p.blocks['CalendarBlockModel'] ?? 0) > 0),
  pagesChart: pagesWith((p) => p.charts.count > 0),
  pagesJS: pagesWith((p) => p.jsBlocks > 0),
  pagesIframe: pagesWith((p) => p.iframes > 0),
  pagesAIChat: pagesWith((p) => p.aiChat > 0),
  pagesNoAddNew: pagesWith((p) => !hasUse(p, 'AddNewActionModel')),
  pagesNoEdit: pagesWith((p) => !hasUse(p, 'EditActionModel')),
  pagesNoDelete: pagesWith((p) => !hasUse(p, 'DeleteActionModel')),
  moneyCols: moneyColumns.length,
  moneyNoFmt: moneyColumns.filter((c) => c.numberFormat === null && c.precision === null && c.separator === null).length,
  dateCols: dateColumns.length,
  dateNoFmt: dateColumns.filter((c) => c.format === null).length,
  relNoTitle: relColumns.filter((c) => c.fieldUse !== 'DisplayTitleFieldModel' || c.titleField === null).length,
  statusBareText: statusBare.length,
  statusNoColor: statusNoColorColumns.length,
  filterFormBlocks: models.filter((r) => r.use === 'FilterFormBlockModel').length,
  relCols: relColumns.length,
  pagesWithRelCol: pagesWith((p) => p.tables.some((t) => t.columns.some((c) => c.rel))),
  pagesNoStats: pagesWith(
    (p) => !(p.charts.count > 0 || p.kanban.count > 0 || (p.blocks['CalendarBlockModel'] ?? 0) > 0 || p.jsBlocks > 0 || p.iframes > 0),
  ),
  grids: gridRecords.length,
  gridsSingleCol: gridRecords.filter((g) => g.allSingleCol).length,
  formFields: gridRecords.reduce((a, g) => a + g.fieldCount, 0),
  formRequired: gridRecords.reduce((a, g) => a + g.requiredCount, 0),
  placeholder,
  defaultValue,
  fieldEmptyProps,
  duplicateCollectionGroups: duplicateGroups,
  inputs: {
    fetchedAt: {
      desktopRoutes: routesArch.fetchedAt ?? null,
      flowModels: modelsArch.fetchedAt ?? null,
      collectionFields: fieldsArch.fetchedAt ?? null,
    },
    analyzedAt: new Date().toISOString(),
    sha256: Object.fromEntries(INPUTS.map((f) => [f, sha256(f)])),
    rows: {
      desktopRoutes: routes.length,
      flowModels: models.length,
      collectionFields: fields.length,
      routeTypeCounts: routes.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {}),
      relationCollections: rel.size,
      relationFields: [...rel.values()].reduce((a, s) => a + s.size, 0),
    },
  },
};
writeArtifact('audit-summary.json', summary);
console.log('--- summary ---');
console.log(JSON.stringify(summary, null, 2));
