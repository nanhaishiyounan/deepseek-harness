# F-round inventory — raw evidence archive

Read-only archive of the browser-verified NocoBase 2.2.6 admin-page inventory
(instance: http://localhost:13000, signed in as admin@nocobase.com) plus a
direct PostgreSQL cross-check. No NocoBase writes were performed (only
`POST /api/auth:signIn` for the session token; every data request is GET).

Fetched: 2026-09-13. The API dump is reproducible via
`node research/f-round-inventory/fetch-archive.mjs` from the repo root.

## Files

| File | Bytes | Source | Description |
|---|---:|---|---|
| `fetch-archive.mjs` | 4450 | — | Dependency-free Node ^22 archiver: signs in, GETs both lists and the 16 page schemas, writes every JSON below (non-200 → stderr, run continues). |
| `desktopRoutes.json` | 36784 | `GET /api/desktopRoutes:list?pageSize=500` | All 63 desktop routes (tabs 28 / page 16 / flowPage 12 / group 7) with titles, icons, ids, parent/child relations. |
| `flowModels.json` | 267819 | `GET /api/flowModels:list?pageSize=2000` | All 473 flowModel rows backing v2 flowPages (page templates incl. UI + flow wiring). |
| `pg-counts.json` | 1767 | psql `localhost:5432/nocobase` (user `mac`) | Row counts for the 23 business tables (all identical to the API inventory), `desktopRoutes` by type, `uiSchemas` total (770). |

## v1-pages/ — `GET /api/uiSchemas:getProperties?resourceIndex=<pageUid>`

| File | Bytes | pageUid | Description |
|---|---:|---|---|
| `v1-pages/产品与服务.json` | 10584 | g50posy0qxc | 产品列表页 schema（表格 + 分类筛选） |
| `v1-pages/客户仪表盘.json` | 9119 | w6nyh5dtycq | 客户侧仪表盘区块 schema |
| `v1-pages/应用中心.json` | 6725 | qj3wstl3cfl | app-hub 应用中心页 schema |
| `v1-pages/回款.json` | 12006 | ihfgg15bm8x | 回款列表页 schema |
| `v1-pages/发票.json` | 12020 | nx1znh4rs6i | 发票列表页 schema |
| `v1-pages/销售仪表盘.json` | 12017 | x00jse3wllw | 销售仪表盘区块 schema |
| `v1-pages/工作台.json` | 22605 | b4k6wf2zu6k | 工作台聚合页 schema（最大单页之一） |
| `v1-pages/任务看板.json` | 13173 | r9152u4r41q | 任务看板（kanban）页 schema |
| `v1-pages/任务日历.json` | 3175 | f0z48rz5pye | 任务日历页 schema |
| `v1-pages/任务甘特.json` | 3129 | zs3oqvlgqq0 | 任务甘特图页 schema |
| `v1-pages/知识文章.json` | 7683 | qn9j7laut2c | KB 文章列表页 schema |
| `v1-pages/供应商.json` | 38058 | 8bjc6gykw7e | 供应商页 schema（本目录最大文件） |
| `v1-pages/维保记录.json` | 12064 | fiyoi38ke5c | 维保记录列表页 schema |
| `v1-pages/部门.json` | 9147 | kdud3tb3iq6 | 部门树页 schema |
| `v1-pages/请假审批.json` | 13541 | i7lcu24opl5 | 请假审批页 schema |
| `v1-pages/分类维护.json` | 29692 | xpcbg0tntto | 分类维护多 tab 页 schema |

## Notes

- System tables are camelCase (`desktopRoutes`, `flowModels`, `uiSchemas`);
  business collections are snake_case — both confirmed via `information_schema`.
- `desktopRoutes` API rowCount (63) equals the psql per-type sum; all 23
  collection counts equal the browser-API inventory values.
