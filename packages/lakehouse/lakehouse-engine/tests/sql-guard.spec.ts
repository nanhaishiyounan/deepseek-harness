import { describe, expect, it } from 'vitest'
import { assertReadOnlySql, readOnlyVerdict, SqlGuardError } from '../src/sql-guard.ts'

describe('readOnlyVerdict acceptance', () => {
  it.each([
    ['SELECT * FROM lake.legacy_nocobase.orders'],
    ['select count(*) from lake.legacy_nocobase.orders'],
    ['WITH recent AS (SELECT * FROM lake.synced.orders LIMIT 5) SELECT * FROM recent'],
    ['PRAGMA database_size'],
    ["PRAGMA table_info('orders')"],
    ['DESCRIBE lake.legacy_nocobase.orders'],
    ['SELECT 1;'],
    ["SELECT ';' AS sep"],
    ['SELECT 1 -- trailing comment'],
  ])('accepts %s', (sql) => {
    expect(readOnlyVerdict(sql)).toEqual({ allowed: true, code: undefined })
    expect(() => { assertReadOnlySql(sql) }).not.toThrow()
  })
})

describe('readOnlyVerdict rejection', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['INSERT INTO lake.main._dsh_lake_state VALUES (1)', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ["UPDATE lake.legacy_nocobase.orders SET id = 1 WHERE 'x' = 'x'", 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['DELETE FROM lake.legacy_nocobase.orders', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['DROP TABLE lake.legacy_nocobase.orders', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['CREATE TABLE x (a INT)', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ["ATTACH 'dbname=evil host=127.0.0.1' AS evil (TYPE postgres)", 'LAKEHOUSE_SQL_NOT_READONLY'],
    ["ATTACH 'ducklake:/tmp/evil.ducklake' AS evil", 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['INSTALL ducklake FROM community', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ["COPY (SELECT 1) TO '/tmp/evil.parquet'", 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['SET memory_limit = \'1GB\'', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['TRUNCATE lake.legacy_nocobase.orders', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['ALTER TABLE lake.legacy_nocobase.orders DROP COLUMN id', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['SELECT * INTO new_table FROM lake.legacy_nocobase.orders', 'LAKEHOUSE_SQL_NOT_READONLY'],
    ["PRAGMA memory_limit='1GB'", 'LAKEHOUSE_SQL_NOT_READONLY'],
    ['select 1; DROP TABLE lake.legacy_nocobase.orders', 'LAKEHOUSE_SQL_MULTI_STATEMENT'],
    ["SELECT 1; DELETE FROM lake.legacy_nocobase.orders WHERE id = '1' -- ';' masked", 'LAKEHOUSE_SQL_MULTI_STATEMENT'],
    ['   ', 'LAKEHOUSE_SQL_EMPTY'],
  ]
  it.each(cases)('rejects %s', (sql, code) => {
    expect(readOnlyVerdict(sql)).toEqual({ allowed: false, code })
    try {
      assertReadOnlySql(sql)
      expect.unreachable('the guard must reject this statement')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlGuardError)
      expect((error as SqlGuardError).code).toBe(code)
    }
  })

  it('treats a semicolon inside a string literal as text, not a statement separator', () => {
    expect(readOnlyVerdict("SELECT 'a;b' AS v").allowed).toBe(true)
  })

  it('treats DML keywords inside string literals as text', () => {
    expect(readOnlyVerdict("SELECT 'DROP TABLE x' AS v").allowed).toBe(true)
  })

  it('rejects a payload hidden after a masked string', () => {
    expect(readOnlyVerdict("SELECT 'x' ; DROP TABLE lake.main._dsh_lake_state").code).toBe('LAKEHOUSE_SQL_MULTI_STATEMENT')
  })
})
