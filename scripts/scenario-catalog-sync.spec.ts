/**
 * Gate for the portal ↔ scenario-library sync: the workbench portal's static
 * `KB_SCENARIOS` catalog and `examples/kb-agent/scenarios/` must name the
 * same scenario set. The portal table exists because the catalog carries
 * display-only copy (category grouping, the English mirror) that the preset
 * directories do not; the cost of that split is a second place where a new
 * scenario must be registered. This gate turns a forgotten registration into
 * a test failure instead of a portal that silently shows fewer cards than
 * the library owns — the failure mode the FIX-M review caught at eleven of
 * thirty. Id equality plus count equality on both sides; anything else
 * (copy edits, category choice) stays out of scope.
 *
 * The catalog is read with the TypeScript AST rather than imported: a
 * scripts spec that imported a client package's source would drag that file
 * into the host typecheck face (the pattern locale-dictionary-parity avoids
 * the same way).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const catalogPath = resolve(root, 'packages/client/ui-kb/src/client/hero/scenarios.ts')
const libraryRoot = resolve(root, 'examples/kb-agent/scenarios')

/** The portal catalog's scenario ids, read from the `KB_SCENARIOS` initializer. */
function portalScenarioIds(): string[] {
  const source = ts.createSourceFile(catalogPath, readFileSync(catalogPath, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const isExport = (statement.modifiers ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    if (!isExport) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'KB_SCENARIOS') continue
      if (declaration.initializer === undefined || !ts.isArrayLiteralExpression(declaration.initializer)) {
        throw new Error('scenario-catalog-sync: KB_SCENARIOS initializer is not an array literal')
      }
      const ids = declaration.initializer.elements.map((element) => {
        if (!ts.isObjectLiteralExpression(element)) throw new Error('scenario-catalog-sync: catalog entry is not an object literal')
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || property.name.text !== 'id') continue
          if (!ts.isStringLiteral(property.initializer)) throw new Error('scenario-catalog-sync: catalog entry id is not a string literal')
          return property.initializer.text
        }
        throw new Error('scenario-catalog-sync: catalog entry without an id property')
      })
      return ids.sort()
    }
  }
  throw new Error('scenario-catalog-sync: KB_SCENARIOS export not found')
}

/** The library's scenario ids: one directory per scenario, sorted for diffs. */
function libraryScenarioIds(): string[] {
  return readdirSync(libraryRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

describe('portal scenario catalog stays in sync with the scenario library', () => {
  it('names exactly the library directory set', () => {
    expect(portalScenarioIds()).toEqual(libraryScenarioIds())
  })
})
