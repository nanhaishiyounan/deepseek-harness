// W7 audit round: read-only NocoBase route census (W7 时点).
// The only POST is /api/auth:signIn; every other request is a GET (list).
// Precedent: research/2026-09-28-w4-completeness/.audit-fetch.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000';
const DIR = fileURLToPath(new URL('.', import.meta.url));

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
      throw new Error(`${resource}:list page ${page} repeats page-1 first row id; aborting to avoid duplicates`);
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

// 1. desktopRoutes — W7 core deliverable (W4 baseline: 206 = group16/page3/tabs95/flowPage92)
try {
  const routes = await getList(token, 'desktopRoutes', 500);
  archive('api-desktopRoutes.json', {
    fetchedAt: new Date().toISOString(),
    base: BASE,
    meta: pageMeta(routes),
    data: routes.flat,
  });
  const byType = {};
  for (const r of routes.flat) byType[r.type] = (byType[r.type] ?? 0) + 1;
  console.log(`desktopRoutes: fetched=${routes.fetched} total=${routes.total} typeCounts=${JSON.stringify(byType)}`);
} catch (error) {
  console.error(`FATAL desktopRoutes: ${error.message}`);
  process.exitCode = 1;
}

// 2. flowModels flat — per-page block composition for the inventory (W4 precedent: 7222 rows)
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

if (issues.length > 0) {
  console.log('non-200 responses this run:');
  for (const i of issues) console.log(`  ${i.status} ${i.url}`);
}
