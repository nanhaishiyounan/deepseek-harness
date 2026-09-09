import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LAKEHOUSE_SQLITE_APPLICATION_ID, SCHEMA_VERSION, validateSchema } from '../src/schema.ts'
import { sql } from '../src/sql.ts'
import { testSql } from './test-sql.ts'

function integerField(row: unknown, field: string): number {
  const value = (row as Record<string, unknown> | undefined)?.[field]
  if (typeof value !== 'number') throw new Error(`field "${field}" is not an integer`)
  return value
}

function openMemory(): DatabaseSync {
  return new DatabaseSync(':memory:')
}

describe('validateSchema', () => {
  it('initializes a pristine database at the current schema version', () => {
    const db = openMemory()
    validateSchema(db, ':memory:')
    expect(integerField(db.prepare(sql('select-user-version')).get(), 'user_version')).toBe(SCHEMA_VERSION)
    expect(integerField(db.prepare(sql('select-application-id')).get(), 'application_id'))
      .toBe(LAKEHOUSE_SQLITE_APPLICATION_ID)
    expect(integerField(db.prepare(testSql('count-own-tables')).get(), 'n')).toBe(3)
    db.close()
  })

  it('accepts an already-initialized database unchanged', () => {
    const db = openMemory()
    validateSchema(db, ':memory:')
    validateSchema(db, ':memory:')
    expect(integerField(db.prepare(sql('select-user-version')).get(), 'user_version')).toBe(SCHEMA_VERSION)
    db.close()
  })

  it('rejects an on-disk schema version this build does not own', () => {
    const db = openMemory()
    db.exec(testSql('set-user-version-2'))
    expect(() => { validateSchema(db, ':memory:') }).toThrow(new RegExp(`schema version 2.*incompatible with this build \\(${SCHEMA_VERSION}\\)`, 'u'))
    db.close()
  })

  it('rejects a matching version with a foreign application id', () => {
    const db = openMemory()
    db.exec(testSql('set-application-id-foreign'))
    db.exec(sql('set-user-version-1'))
    expect(() => { validateSchema(db, ':memory:') }).toThrow(/application id/u)
    db.close()
  })

  it('rejects an unversioned database that already owns user objects', () => {
    const db = openMemory()
    db.exec(testSql('create-conflicting-table'))
    expect(() => { validateSchema(db, ':memory:') }).toThrow(/already exists/u)
    db.close()
  })

  it('rejects an unversioned database carrying a foreign application id', () => {
    const db = openMemory()
    db.exec(testSql('set-application-id-foreign'))
    expect(() => { validateSchema(db, ':memory:') }).toThrow(/unversioned/u)
    db.close()
  })

  it('configures WAL journaling for a file-backed database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-schema-'))
    const path = join(directory, 'catalog.sqlite')
    try {
      const db = new DatabaseSync(path)
      validateSchema(db, path)
      const mode = (db.prepare(sql('select-user-version')).get() as { user_version: number }).user_version
      expect(mode).toBe(SCHEMA_VERSION)
      db.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
