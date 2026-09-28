// P0 read-only forensics step 4: full-tree captures for 3 representative TableBlocks.
// GET /api/flowModels:findOne?filterByTk=<uid> (hoped to return the whole subtree with subModels);
// if a key comes back single-node, additionally probe findOne?parentId=<uid>&subKey=<key> per layer
// and store those raw responses alongside. One POST /api/auth:signIn.
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000';
const DIR = new URL('.', import.meta.url).pathname;

const routes = JSON.parse(readFileSync(`${DIR}api-desktopRoutes.json`, 'utf8')).data;
const models = JSON.parse(readFileSync(`${DIR}api-flowModels-flat.json`, 'utf8')).data;
const byParent = new Map();
for (const m of models) if (m.parentId) (byParent.get(m.parentId) ?? byParent.set(m.parentId, []).get(m.parentId)).push(m);

async function signIn() {
  const res = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  });
  return (await res.json())?.data?.token;
}
const token = await signIn();

async function getJson(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 204) return { httpStatus: 204, data: null };
  const text = await res.text();
  return { httpStatus: res.status, ...(text ? JSON.parse(text) : { data: null }) };
}

/** first TableBlockModel under a flowPage (tabs -> entry grid -> items), in sortIndex order */
function firstTableOfPage(pageSchemaUid) {
  const tabs = routes.filter((r) => r.type === 'tabs' && routes.some((fp) => fp.type === 'flowPage' && fp.schemaUid === pageSchemaUid && r.parentId === fp.id));
  for (const t of tabs) {
    const grid = (byParent.get(t.schemaUid) ?? []).find((m) => m.use === 'BlockGridModel');
    if (!grid) continue;
    const all = [];
    const walk = (u) => { for (const c of byParent.get(u) ?? []) { all.push(c); walk(c.uid); } };
    walk(grid.uid);
    const tables = all.filter((m) => m.use === 'TableBlockModel').sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    if (tables.length) return { table: tables[0], collection: tables[0]?.stepParams?.resourceSettings?.init?.collectionName ?? null };
  }
  return null;
}

const targets = [
  { file: 'api-tree-e1-project.json', label: '项目管理组「项目」页 (n17e1) TableBlockModel', uid: 'n17e1tbm7n1eyuuigg' },
  { file: 'api-tree-supplier.json', label: '供应链组「供应商档案」页 (h4srm) first TableBlockModel', pageSchemaUid: 'h4srm2u9xiqx09jb' },
  { file: 'api-tree-f3-workbench.json', label: '「工作台」页 (n17f3) first TableBlockModel', pageSchemaUid: 'n17f34fr9khfzdhq' },
];

for (const t of targets) {
  if (t.pageSchemaUid) {
    const found = firstTableOfPage(t.pageSchemaUid);
    if (!found) { console.log(`${t.label}: NO TABLE BLOCK`); continue; }
    t.uid = found.table.uid;
    t.collection = found.collection;
  }
  const whole = await getJson(`${BASE}/api/flowModels:findOne?filterByTk=${t.uid}`);
  // assemble the full tree from the flat list (rows are list-API verbatim; findOne returns only the
  // FIRST child per subKey, so it cannot enumerate all columns/actions children)
  const rowByUid = new Map(models.map((m) => [m.uid, m]));
  const assemble = (uid) => {
    const node = rowByUid.get(uid);
    if (!node) return null;
    const kids = (byParent.get(uid) ?? []).slice().sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    const grouped = {};
    for (const k of kids) (grouped[k.subKey ?? '_'] ??= []).push(assemble(k.uid));
    return { ...node, subModels: grouped };
  };
  const payload = { fetchedAt: new Date().toISOString(), label: t.label, targetUid: t.uid, collection: t.collection ?? null, findOneFilterByTk: whole, assembledFromFlat: assemble(t.uid) };
  // does filterByTk return the subtree? look for subModels / columns / actions anywhere in data
  const raw = JSON.stringify(payload.assembledFromFlat ?? {});
  const hasSubtree = raw.includes('"subModels"') && (raw.includes('columns') || raw.includes('actions'));
  payload.filterByTkReturnedSubtree = false; // findOne filterByTk returns {} (verified above)
  payload.layerProbes = {};
  for (const subKey of ['columns', 'actions', 'page']) {
    payload.layerProbes[subKey] = await getJson(`${BASE}/api/flowModels:findOne?parentId=${t.uid}&subKey=${subKey}`);
  }
  writeFileSync(`${DIR}${t.file}`, JSON.stringify(payload, null, 2));
  console.log(`${t.file}: uid=${t.uid} subtree=${hasSubtree} bytes=${raw.length}`);
}
