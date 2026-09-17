/**
 * The shared session-cwd resolution basis as a pure function: `undefined`
 * passes through for non-agent callers, an ordinary cwd returns verbatim, and
 * parent traversal on either side canonicalizes the cwd so a symlinked
 * workspace's filesystem identity is what resolves.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sessionResolveCwd } from '../src/session-path.ts'

describe('sessionResolveCwd', () => {
  it('returns undefined for a non-agent caller and an ordinary cwd verbatim', () => {
    expect(sessionResolveCwd(undefined, 'file.txt')).toBeUndefined()
    const cwd = process.cwd()
    expect(sessionResolveCwd(cwd, 'file.txt')).toBe(cwd)
  })

  it('canonicalizes the cwd when either side traverses a parent segment', () => {
    const throughParent = `${process.cwd()}${sep}..`
    expect(sessionResolveCwd(throughParent, 'file.txt')).toBe(realpathSync.native(throughParent))

    const root = mkdtempSync(join(tmpdir(), 'dsh-fs-session-path-'))
    const physical = join(root, 'physical')
    const link = join(root, 'link')
    try {
      mkdirSync(physical)
      symlinkSync(physical, link, process.platform === 'win32' ? 'junction' : 'dir')
      expect(sessionResolveCwd(link, 'child.txt')).toBe(link)
      expect(sessionResolveCwd(link, `..${sep}parent.txt`)).toBe(realpathSync.native(link))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
