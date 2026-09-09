/** Test-only loader for fixed SQLite fixtures. */

import { readFileSync } from 'node:fs'

export type TestSqlName =
  | 'corrupt-columns'
  | 'corrupt-columns-array'
  | 'corrupt-columns-entry'
  | 'count-own-tables'
  | 'create-conflicting-table'
  | 'create-failing-insert-trigger'
  | 'set-application-id-foreign'
  | 'set-user-version-2'

/** Load one fixed test SQL resource. */
export function testSql(name: TestSqlName): string {
  return readFileSync(new URL(`./resources/sql/${name}.sql`, import.meta.url), 'utf8')
}
