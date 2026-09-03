/** Test-only loader for fixed SQLite fixtures. */

import { readFileSync } from 'node:fs'

export type TestSqlName =
  | 'count-chunks-table'
  | 'count-documents-table'
  | 'count-usage-table'
  | 'drop-usage-table'
  | 'create-conflicting-table'
  | 'create-failing-delete-trigger'
  | 'set-application-id-foreign'
  | 'set-application-id-kb'
  | 'set-user-version-1'
  | 'set-user-version-2'
  | 'set-user-version-4'
  | 'set-user-version-3'

/** Load one fixed test SQL resource. */
export function testSql(name: TestSqlName): string {
  return readFileSync(new URL(`./resources/sql/${name}.sql`, import.meta.url), 'utf8')
}
