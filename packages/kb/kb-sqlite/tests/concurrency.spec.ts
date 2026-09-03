/**
 * Dual-connection concurrency over one SQLite file: WAL cross-connection
 * visibility, busy-timeout resolution and exhaustion against a write lock
 * held on another thread, and interleaved ingest from two connections.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import type { KbChunkInput, KbDocumentInput } from '@deepseek-ai/dsh-kb'
import { SqliteKbStore } from '../src/store.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function freshFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-kb-sqlite-concurrency-'))
  directories.push(directory)
  return join(directory, 'kb.sqlite')
}

function openStore(path: string, busyTimeoutMs = 5_000): SqliteKbStore {
  return new SqliteKbStore({ path, busyTimeoutMs }, DatabaseSync)
}

function doc(overrides: Partial<KbDocumentInput> = {}): KbDocumentInput {
  return {
    tenantId: 'hongfa-food',
    sourcePath: 'notes/visit.md',
    docKind: 'meeting',
    ...overrides,
  }
}

function chunk(chunkIdx: number, content: string): KbChunkInput {
  return { chunkIdx, content, embedding: null }
}

/**
 * Worker source (evaluated as CommonJS): open one raw connection, take the
 * write lock with BEGIN IMMEDIATE, release it after `holdMs`. The lock holder
 * must live on another thread — the store's SQLite calls are synchronous, so
 * the main thread can never release a lock while a second connection waits.
 */
const LOCK_HOLDER_SOURCE = `
'use strict'
const { parentPort, workerData } = require('node:worker_threads')
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(workerData.path, { timeout: 5_000 })
db.exec('BEGIN IMMEDIATE')
parentPort.postMessage('locked')
setTimeout(() => {
  db.exec('COMMIT')
  parentPort.postMessage('released')
  db.close()
}, workerData.holdMs)
`

async function holdWriteLock(path: string, holdMs: number): Promise<Worker> {
  const worker = new Worker(LOCK_HOLDER_SOURCE, { eval: true, workerData: { path, holdMs } })
  const [message] = await once(worker, 'message') as [unknown]
  if (message !== 'locked') throw new Error(`unexpected lock-holder message: ${String(message)}`)
  return worker
}

/**
 * Competing-deleter worker source (evaluated as CommonJS): open one raw
 * connection, take the write lock, delete one identity's rows inside the
 * transaction, then hold the lock for `holdMs` before committing — the
 * uncommitted delete stays invisible to other connections until the commit.
 */
const COMPETING_DELETER_SOURCE = `
'use strict'
const { parentPort, workerData } = require('node:worker_threads')
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(workerData.path, { timeout: 5_000 })
db.exec('BEGIN IMMEDIATE')
db.prepare('DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = (SELECT id FROM documents WHERE tenant_id = ? AND source_path = ?))').run(workerData.tenantId, workerData.sourcePath)
db.prepare('DELETE FROM documents WHERE tenant_id = ? AND source_path = ?').run(workerData.tenantId, workerData.sourcePath)
parentPort.postMessage('deleted')
setTimeout(() => {
  db.exec('COMMIT')
  parentPort.postMessage('released')
  db.close()
}, workerData.holdMs)
`

async function deleteAsCompetingWorker(
  path: string,
  tenantId: string,
  sourcePath: string,
  holdMs: number,
): Promise<Worker> {
  const worker = new Worker(COMPETING_DELETER_SOURCE, { eval: true, workerData: { path, tenantId, sourcePath, holdMs } })
  const [message] = await once(worker, 'message') as [unknown]
  if (message !== 'deleted') throw new Error(`unexpected competing-deleter message: ${String(message)}`)
  return worker
}

describe('SqliteKbStore dual-connection concurrency', () => {
  it('exposes a committed write to a second connection over WAL', async () => {
    const path = await freshFile()
    const a = openStore(path)
    const b = openStore(path)
    try {
      await a.putDocument(doc({ sourcePath: 'shared/visible.md' }), [chunk(0, '跨连接可见的白糖纪要。')])
      expect((await b.stats(undefined)).documents).toBe(1)
      const hits = await b.textSearch('跨连接可见', undefined, 8, undefined)
      expect(hits.map(hit => hit.sourcePath)).toEqual(['shared/visible.md'])
    } finally {
      a.close()
      b.close()
    }
  })

  it('resolves a concurrent write through the busy timeout once the other connection commits', async () => {
    const path = await freshFile()
    const a = openStore(path)
    const b = openStore(path)
    const worker = await holdWriteLock(path, 150)
    try {
      const result = await b.putDocument(doc({ sourcePath: 'busy/resolved.md' }), [chunk(0, '忙碌化解后的面粉记录。')])
      expect(result.chunks).toBe(1)
      expect((await a.stats(undefined)).documents).toBe(1)
    } finally {
      await worker.terminate()
      a.close()
      b.close()
    }
  })

  it('fails loud with SQLITE_BUSY once the busy timeout expires, then recovers after the lock clears', async () => {
    const path = await freshFile()
    const a = openStore(path)
    const impatient = openStore(path, 150)
    const worker = await holdWriteLock(path, 60_000)
    try {
      await expect(impatient.putDocument(doc({ sourcePath: 'busy/exhausted.md' }), [chunk(0, '不应写入的文档。')]))
        .rejects.toThrow(/database is locked|busy/iu)
      expect((await a.stats(undefined)).documents).toBe(0)
    } finally {
      await worker.terminate()
    }
    // The failed BEGIN left no open transaction, so the store stays usable.
    await impatient.putDocument(doc({ sourcePath: 'busy/exhausted.md' }), [chunk(0, '锁释放后的重试写入。')])
    expect((await a.stats(undefined)).documents).toBe(1)
    a.close()
    impatient.close()
  })

  it('reports false when a competing transaction deletes the same identity first', async () => {
    const path = await freshFile()
    const a = openStore(path)
    const b = openStore(path)
    await a.putDocument(doc({ sourcePath: 'race/delete-me.md' }), [chunk(0, '并发删除竞争的目标文档。')])
    const worker = await deleteAsCompetingWorker(path, 'hongfa-food', 'race/delete-me.md', 150)
    try {
      // The worker's uncommitted delete is invisible, but deleteDocument waits
      // for the write lock BEFORE its existence check, so after the competing
      // commit the in-transaction SELECT sees the identity gone: zero deleted
      // rows report false. A SELECT before BEGIN IMMEDIATE would have observed
      // the row, waited at the DELETE, and wrongly reported true.
      const deleted = await b.deleteDocument('hongfa-food', 'race/delete-me.md')
      expect(deleted).toBe(false)
      expect((await a.stats(undefined)).documents).toBe(0)
      expect(await a.textSearch('并发删除竞争', undefined, 8, undefined)).toEqual([])
    } finally {
      await worker.terminate()
      a.close()
      b.close()
    }
  })

  it('keeps interleaved writes from two connections complete and unique', async () => {
    const path = await freshFile()
    const a = openStore(path)
    const b = openStore(path)
    try {
      const writers = [a, b] as const
      const total = 12
      const results = await Promise.all(Array.from({ length: total }, (_, index) =>
        writers[index % 2]!.putDocument(
          doc({ sourcePath: `concurrent/doc-${index}.md`, title: `doc-${index}` }),
          [chunk(0, `交叉并发写入的第 ${index} 篇文档内容。`)],
        )))
      expect(new Set(results.map(result => result.docId)).size).toBe(total)
      const stats = await b.stats(undefined)
      expect(stats.documents).toBe(total)
      expect(stats.chunks).toBe(total)
      for (let index = 0; index < total; index += 1) {
        const hits = await a.textSearch(`第 ${index} 篇`, undefined, 8, undefined)
        expect(hits.map(hit => hit.sourcePath)).toEqual([`concurrent/doc-${index}.md`])
      }
    } finally {
      a.close()
      b.close()
    }
  })
})
