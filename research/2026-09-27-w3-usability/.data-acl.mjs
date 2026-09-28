// P0 read-only forensics step 5-6: data-layer row counts + ACL (roles/users) captures.
// GET-only data calls + one POST /api/auth:signIn. Optional member-view probe is driven by
// MEMBER_ACCOUNT/MEMBER_PASSWORD env vars (sought from examples/kb-agent scripts, not guessed).
import { writeFileSync } from 'node:fs';

const BASE = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000';
const DIR = new URL('.', import.meta.url).pathname;

async function signIn(account, password) {
  const res = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  const json = await res.json();
  return { token: json?.data?.token ?? null, httpStatus: res.status };
}
const { token } = await signIn('admin@nocobase.com', 'admin123');
if (!token) throw new Error('admin signIn failed');
const auth = { authorization: `Bearer ${token}` };

async function getJson(url, headers = auth) {
  const res = await fetch(url, { headers });
  if (res.status === 204) return { httpStatus: 204, data: null, meta: null };
  const text = await res.text();
  if (!text) return { httpStatus: res.status, data: null, meta: null };
  try {
    const json = JSON.parse(text);
    return { httpStatus: res.status, data: json?.data ?? null, meta: json?.meta ?? null, errors: json?.errors ?? null };
  } catch {
    // non-JSON body (e.g. plain "Not Found" for a missing collection) — keep verbatim
    return { httpStatus: res.status, body: text.slice(0, 300), data: null, meta: null };
  }
}

// step 5: data samples — keep meta.total + first-row id/title-ish fields only (truncate the rest)
const TITLE_KEYS = ['id', 'title', 'name', 'supplier_name', 'project_name', 'task_title', 'status', 'nickname', 'username'];
const dataSamples = { fetchedAt: new Date().toISOString(), base: BASE, collections: {} };
for (const name of ['crm_suppliers', 'hub_pj_projects', 'hub_pj_tasks', 'srm_suppliers']) {
  const j = await getJson(`${BASE}/api/${name}:list?pageSize=1`);
  const first = Array.isArray(j.data) ? j.data[0] : null;
  dataSamples.collections[name] = {
    httpStatus: j.httpStatus,
    total: j.meta?.total ?? null,
    firstRow: first ? Object.fromEntries(TITLE_KEYS.filter((k) => k in first).map((k) => [k, first[k]])) : null,
    note: first ? 'other fields truncated per task scope' : (j.body ? `non-JSON body: ${j.body}` : (j.errors ? JSON.stringify(j.errors).slice(0, 200) : 'empty list')),
  };
  console.log(`${name}: total=${j.meta?.total ?? '?'} first=${first ? JSON.stringify(dataSamples.collections[name].firstRow) : 'none'}`);
}
writeFileSync(`${DIR}api-data-samples.json`, JSON.stringify(dataSamples, null, 2));

// step 6a: roles verbatim (strategy/snippets matter)
const roles = await getJson(`${BASE}/api/roles:list?pageSize=100`);
writeFileSync(`${DIR}api-roles.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), base: BASE, meta: roles.meta, data: roles.data }, null, 2));
console.log('roles:', (roles.data ?? []).map((r) => `${r.name}${r.title ? `(${r.title})` : ''}`).join(', '));

// step 6b: users — id/nickname/roles only
const users = await getJson(`${BASE}/api/users:list?pageSize=100&appends=roles`);
const usersCompact = (users.data ?? []).map((u) => ({ id: u.id, nickname: u.nickname, username: u.username, roles: (u.roles ?? []).map((r) => r.name) }));
writeFileSync(`${DIR}api-users.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), base: BASE, meta: users.meta, data: usersCompact }, null, 2));
console.log('users:', JSON.stringify(usersCompact.map((u) => ({ id: u.id, nickname: u.nickname, roles: u.roles }))));

// step 6c: member-view tree probe if credentials were found
const memberAccount = process.env.MEMBER_ACCOUNT;
const memberPassword = process.env.MEMBER_PASSWORD;
if (memberAccount && memberPassword) {
  const m = await signIn(memberAccount, memberPassword);
  if (!m.token) {
    console.log(`member signIn FAILED http=${m.httpStatus}`);
    writeFileSync(`${DIR}api-tree-e1-project-member.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), note: `member signIn failed http=${m.httpStatus}`, account: memberAccount }, null, 2));
  } else {
    const whole = await getJson(`${BASE}/api/flowModels:findOne?filterByTk=n17e1tbm7n1eyuuigg`, { authorization: `Bearer ${m.token}` });
    const cols = await getJson(`${BASE}/api/flowModels:findOne?parentId=n17e1tbm7n1eyuuigg&subKey=columns`, { authorization: `Bearer ${m.token}` });
    const acts = await getJson(`${BASE}/api/flowModels:findOne?parentId=n17e1tbm7n1eyuuigg&subKey=actions`, { authorization: `Bearer ${m.token}` });
    writeFileSync(`${DIR}api-tree-e1-project-member.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), account: memberAccount, note: 'member token; e1 project TableBlock probes for ACL comparison', filterByTk: whole, columnsFirst: cols, actionsFirst: acts }, null, 2));
    console.log('member tree probes written');
  }
} else {
  console.log('MEMBER creds not provided — ACL member-view comparison skipped (recorded)');
}
