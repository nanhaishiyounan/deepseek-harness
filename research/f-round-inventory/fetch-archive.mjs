/**
 * Read-only NocoBase evidence archiver for the F-round admin-page inventory.
 *
 * Signs in as the demo admin, then issues GET-only requests against the
 * local NocoBase 2.2.6 instance and dumps raw responses to JSON files next
 * to this script:
 *   - desktopRoutes.json  ← GET /api/desktopRoutes:list?pageSize=500
 *   - flowModels.json     ← GET /api/flowModels:list?pageSize=2000
 *   - v1-pages/<title>.json (×16) ← GET /api/uiSchemas:getProperties?resourceIndex=<pageUid>
 *
 * Non-200 responses are reported on stderr and skipped; the run continues.
 * Sign-in retry follows the examples/kb-agent/scripts/nocobase-n17-alignment.mts
 * pattern: up to 4 attempts, 8s apart.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'v1-pages')

const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://localhost:13000'
const account = 'admin@nocobase.com'
const password = 'admin123'

/** The 16 v1 pages inventoried in the browser-verified F round. */
const v1Pages = [
  ['产品与服务', 'g50posy0qxc'],
  ['客户仪表盘', 'w6nyh5dtycq'],
  ['应用中心', 'qj3wstl3cfl'],
  ['回款', 'ihfgg15bm8x'],
  ['发票', 'nx1znh4rs6i'],
  ['销售仪表盘', 'x00jse3wllw'],
  ['工作台', 'b4k6wf2zu6k'],
  ['任务看板', 'r9152u4r41q'],
  ['任务日历', 'f0z48rz5pye'],
  ['任务甘特', 'zs3oqvlgqq0'],
  ['知识文章', 'qn9j7laut2c'],
  ['供应商', '8bjc6gykw7e'],
  ['维保记录', 'fiyoi38ke5c'],
  ['部门', 'kdud3tb3iq6'],
  ['请假审批', 'i7lcu24opl5'],
  ['分类维护', 'xpcbg0tntto'],
]

async function call(method, path, body, token = '') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  }
  return payload
}

async function signIn() {
  const payload = await call('POST', '/api/auth:signIn', { account, password })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${account} returned no token`)
  return token
}

async function signInWithRetry(attempts = 4) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      return await signIn()
    } catch (error) {
      lastError = error
      process.stderr.write(`sign-in attempt ${i + 1}/${attempts} failed: ${lastError.message}\n`)
      await new Promise((resolve) => setTimeout(resolve, 8000))
    }
  }
  throw lastError
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  process.stdout.write(`wrote ${path} (${(await import('node:fs')).statSync(path).size} bytes)\n`)
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const token = await signInWithRetry()

  for (const [endpoint, file, pageSize] of [
    ['/api/desktopRoutes:list?pageSize=500', 'desktopRoutes.json', 500],
    ['/api/flowModels:list?pageSize=2000', 'flowModels.json', 2000],
  ]) {
    try {
      const payload = await call('GET', endpoint, undefined, token)
      const rows = Array.isArray(payload?.data) ? payload.data : []
      await writeJson(join(here, file), {
        fetchedAt: new Date().toISOString(),
        endpoint: `${baseUrl}${endpoint}`,
        rowCount: rows.length,
        rows,
      })
    } catch (error) {
      process.stderr.write(`ERROR ${endpoint}: ${error.message}\n`)
    }
  }

  for (const [title, pageUid] of v1Pages) {
    const endpoint = `/api/uiSchemas:getProperties?resourceIndex=${pageUid}`
    try {
      const payload = await call('GET', endpoint, undefined, token)
      await writeJson(join(outDir, `${title}.json`), {
        fetchedAt: new Date().toISOString(),
        title,
        pageUid,
        tree: payload?.data ?? null,
      })
    } catch (error) {
      process.stderr.write(`ERROR ${title} (${pageUid}) ${endpoint}: ${error.message}\n`)
    }
  }
}

main().catch((error) => {
  process.stderr.write(`fatal: ${error.message}\n`)
  process.exitCode = 1
})
