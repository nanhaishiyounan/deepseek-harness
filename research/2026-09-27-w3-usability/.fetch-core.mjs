// P0 read-only forensics step 1-2: sign in, pull desktopRoutes + flowModels (full pagination).
// Only GET list calls + POST /api/auth:signIn. Writes api-desktopRoutes.json / api-flowModels-flat.json.
// Target: :3080 has no /api routes (dsh web patch server, verified 404 on /api/auth:signIn and
// /api/desktopRoutes:list); the real NocoBase server is :13000 per root .env NOCOBASE_BASE_URL.
import { writeFileSync } from 'node:fs';

const BASE = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000';
const DIR = new URL('.', import.meta.url).pathname;

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

async function getListRaw(token, resource, { pageSize = 500 } = {}) {
  const pages = [];
  let page = 1;
  let total = null;
  for (;;) {
    const url = `${BASE}/api/${resource}:list?page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`${resource}:list page ${page} HTTP ${res.status}`);
    const json = await res.json();
    const rows = json.data ?? [];
    total = json.meta?.total ?? total;
    pages.push({ page, requestedPageSize: pageSize, meta: json.meta ?? null, count: rows.length, data: rows });
    if (rows.length === 0) break;
    if (total != null && pages.reduce((n, p) => n + p.count, 0) >= total) break;
    if (rows.length < pageSize) break; // server capped the page; keep going via next page anyway when total unknown
    page += 1;
  }
  const fetched = pages.reduce((n, p) => n + p.count, 0);
  if (total != null && fetched < total) throw new Error(`${resource}: truncated — fetched ${fetched}/${total}; refusing to conclude`);
  return { fetched, total, pages };
}

const token = await signIn();
console.log('signed in OK');

const routes = await getListRaw(token, 'desktopRoutes');
const flatRoutes = routes.pages.flatMap((p) => p.data);
writeFileSync(`${DIR}api-desktopRoutes.json`, JSON.stringify({
  fetchedAt: new Date().toISOString(),
  base: BASE,
  note: 'single-call raw when one page; else pages merged. rows are server verbatim',
  meta: { total: routes.total, fetched: routes.fetched, pages: routes.pages.map((p) => ({ page: p.page, count: p.count, meta: p.meta })) },
  data: flatRoutes,
}, null, 2));
console.log(`desktopRoutes: fetched=${routes.fetched} total=${routes.total}`);

const models = await getListRaw(token, 'flowModels');
const flatModels = models.pages.flatMap((p) => p.data);
writeFileSync(`${DIR}api-flowModels-flat.json`, JSON.stringify({
  fetchedAt: new Date().toISOString(),
  base: BASE,
  meta: { total: models.total, fetched: models.fetched, pages: models.pages.map((p) => ({ page: p.page, count: p.count, meta: p.meta })) },
  data: flatModels,
}, null, 2));
console.log(`flowModels: fetched=${models.fetched} total=${models.total}`);

// quick shape summary so the analyzer can be written against real fields
const routeTypes = {};
for (const r of flatRoutes) routeTypes[r.type] = (routeTypes[r.type] ?? 0) + 1;
console.log('route.type counts:', JSON.stringify(routeTypes));
const modelTypes = {};
for (const m of flatModels) modelTypes[m.type] = (modelTypes[m.type] ?? 0) + 1;
console.log('flowModel.type counts:', JSON.stringify(modelTypes));
console.log('sample route row:', JSON.stringify(flatRoutes.find((r) => r.type !== 'group') ?? flatRoutes[0]));
console.log('sample model row:', JSON.stringify(flatModels[0]));
console.log('sample table model row:', JSON.stringify(flatModels.find((m) => m.type?.includes('Table')) ?? null));
