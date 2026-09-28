// W4 completeness round: read-only NocoBase archive.
// The only POST is /api/auth:signIn; every other request is a GET (list / getProperties).
// Archives raw JSON next to this script in the W3 shape: { fetchedAt, base, meta, data }.
// Precedent: research/2026-09-27-w3-usability/.fetch-core.mjs (signIn + paginated list)
// and research/f-round-inventory/fetch-archive.mjs (uiSchemas:getProperties per page).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000';
const DIR = fileURLToPath(new URL('.', import.meta.url));

/** Every non-200 response seen this run: { url, status }. Printed in the run summary. */
const issues = [];

function archive(file, value) {
  writeFileSync(`${DIR}${file}`, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${file}`);
}

async function signIn() {
  const res = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  });
  if (!res.ok) throw new Error(`signIn HTTP ${res.status}`);
  const json = await res.json();
  const token = json?.data?.token;
  if (!token) throw new Error('signIn ok but no data.token');
  return token;
}

/**
 * Paginated GET <resource>:list until fetched covers meta.total.
 * Keeps paging past server-capped pages (rows.length < pageSize while fetched < total).
 * Aborts loudly if paging stalls (repeated first row id) so no duplicate rows are archived.
 */
async function getList(token, resource, pageSize) {
  const pages = [];
  let page = 1;
  let total = null;
  let fetched = 0;
  let firstPageFirstId = null;
  for (;;) {
    const url = `${BASE}/api/${resource}:list?page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      issues.push({ url, status: res.status });
      throw new Error(`${resource}:list page ${page} HTTP ${res.status}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    total = json?.meta?.total ?? total;
    pages.push({ page, requestedPageSize: pageSize, count: rows.length, meta: json?.meta ?? null, data: rows });
    fetched += rows.length;
    if (page === 1 && rows.length > 0 && rows[0].id !== undefined) firstPageFirstId = rows[0].id;
    if (page > 1 && firstPageFirstId !== null && rows.length > 0 && rows[0].id === firstPageFirstId) {
      throw new Error(`${resource}:list page ${page} repeats page-1 first row id; server ignores paging, aborting to avoid duplicates`);
    }
    if (rows.length === 0) break;
    if (total != null && fetched >= total) break;
    if (total == null && rows.length < pageSize) break;
    if (page >= 1000) throw new Error(`${resource}:list exceeded 1000 pages`);
    page += 1;
  }
  return { total, fetched, pages, flat: pages.flatMap((p) => p.data) };
}

const pageMeta = (r) => ({ total: r.total, fetched: r.fetched, pages: r.pages.map((p) => ({ page: p.page, count: p.count, meta: p.meta })) });

const token = await signIn();
console.log(`signed in OK (${BASE})`);

// 1. desktopRoutes (expected 206: group16/page3/tabs95/flowPage92)
let routeFlat = [];
try {
  const routes = await getList(token, 'desktopRoutes', 500);
  routeFlat = routes.flat;
  archive('api-desktopRoutes.json', {
    fetchedAt: new Date().toISOString(),
    base: BASE,
    meta: pageMeta(routes),
    data: routes.flat,
  });
  const byType = {};
  for (const r of routeFlat) byType[r.type] = (byType[r.type] ?? 0) + 1;
  console.log(`desktopRoutes: fetched=${routes.fetched} total=${routes.total} typeCounts=${JSON.stringify(byType)}`);
} catch (error) {
  console.error(`FATAL desktopRoutes: ${error.message}`);
  process.exitCode = 1;
}

// 2. flowModels flat (pageSize=2000; keep paging if server caps the page)
try {
  const models = await getList(token, 'flowModels', 2000);
  if (models.total != null && models.flat.length !== models.total) {
    throw new Error(`flowModels meta.total=${models.total} but archived rows=${models.flat.length}`);
  }
  archive('api-flowModels-flat.json', {
    fetchedAt: new Date().toISOString(),
    base: BASE,
    meta: pageMeta(models),
    data: models.flat,
  });
  console.log(`flowModels: fetched=${models.fetched} total=${models.total}`);
} catch (error) {
  console.error(`FATAL flowModels: ${error.message}`);
  process.exitCode = 1;
}

// 3. uiSchemas:getProperties for every desktopRoutes row with type=page
const v1Rows = routeFlat.filter((r) => r.type === 'page');
for (const row of v1Rows) {
  const uid = row.schemaUid ?? row.uiSchemaUid;
  if (!uid) {
    issues.push({ url: '(desktopRoutes page row)', status: `missing schemaUid; row keys: ${Object.keys(row).join(',')}` });
    continue;
  }
  const url = `${BASE}/api/uiSchemas:getProperties?resourceIndex=${uid}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    issues.push({ url, status: res.status });
    continue;
  }
  const json = await res.json();
  archive(`api-v1-page-${uid}.json`, {
    fetchedAt: new Date().toISOString(),
    base: BASE,
    note: `desktopRoutes type=page title=${JSON.stringify(row.title ?? null)}`,
    meta: { endpoint: url, routeId: row.id ?? null },
    data: json?.data ?? null,
  });
}
console.log(`v1 pages: ${v1Rows.length} type=page rows → ${JSON.stringify(v1Rows.map((r) => [r.title, r.schemaUid ?? r.uiSchemaUid]))}`);

// 4. collections (pageSize=100)
try {
  const collections = await getList(token, 'collections', 100);
  archive('api-collections.json', {
    fetchedAt: new Date().toISOString(),
    base: BASE,
    meta: pageMeta(collections),
    data: collections.flat,
  });
  console.log(`collections: fetched=${collections.fetched} total=${collections.total}`);
} catch (error) {
  console.error(`FATAL collections: ${error.message}`);
  process.exitCode = 1;
}

// 5. collectionFields, falling back to /api/fields:list, else archive the skip reason
let fieldsDone = false;
for (const resource of ['collectionFields', 'fields']) {
  try {
    const fields = await getList(token, resource, 2000);
    archive('api-collection-fields.json', {
      fetchedAt: new Date().toISOString(),
      base: BASE,
      note: resource === 'fields' ? 'collectionFields:list unavailable; archived from /api/fields:list' : undefined,
      meta: { ...pageMeta(fields), resource },
      data: fields.flat,
    });
    console.log(`${resource}: fetched=${fields.fetched} total=${fields.total}`);
    fieldsDone = true;
    break;
  } catch (error) {
    console.error(`${resource}:list failed: ${error.message}`);
  }
}
if (!fieldsDone) {
  archive('api-collection-fields.json', {
    fetchedAt: new Date().toISOString(),
    base: BASE,
    note: 'skipped: both /api/collectionFields:list and /api/fields:list failed (see issues below)',
    meta: { skipped: true, attempted: ['collectionFields:list', 'fields:list'] },
    data: null,
  });
}

console.log('--- run summary ---');
console.log(`issues (non-200 / anomalies): ${issues.length}`);
for (const i of issues) console.log(`  ${i.status}  ${i.url}`);
