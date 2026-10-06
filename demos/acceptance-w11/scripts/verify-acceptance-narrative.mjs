#!/usr/bin/env node
/**
 * The acceptance-narrative gate (W11-R5, the lessons-7 lightweight form):
 * each claim is a triple { claim, file-glob, must-contain | absent } plus
 * optional commit facts (commit, commit-must-touch, commit-must-not-touch).
 * The gate greps the working tree's files for the claimed wording and
 * checks `git show --stat` against the claimed commit facts. Any miss
 * fails the run. Usage: node verify-acceptance-narrative.mjs <claims.json>
 * — run from the repository root; the log is written to stdout and the
 * --log path if given.
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const input = process.argv[2]
const logIndex = process.argv.indexOf('--log')
const logPath = logIndex !== -1 ? process.argv[logIndex + 1] : undefined
if (input === undefined || input.startsWith('--')) {
  console.error('usage: node verify-acceptance-narrative.mjs <claims.json> [--log <out>]')
  process.exit(2)
}

/** One glob → RegExp: `**` spans path separators, `*` stays within one segment. */
function globToRegExp(glob) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${body}$`)
}

/** Every file under the repository (minus .git/node_modules) matching one glob. */
function matchFiles(glob) {
  const rx = globToRegExp(glob)
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules' || name === 'lib' || name === 'types') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (rx.test(full)) found.push(full)
    }
  }
  walk('.')
  return found.sort()
}

const lines = []
let failures = 0
const claims = JSON.parse(readFileSync(input, 'utf8'))
for (const entry of claims) {
  const notes = []
  const files = matchFiles(entry['file-glob'])
  if (files.length === 0) notes.push(`no file matches ${entry['file-glob']}`)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const needle of entry['must-contain'] ?? []) {
      if (!text.includes(needle)) notes.push(`${file}: missing "${needle}"`)
    }
    for (const needle of entry.absent ?? []) {
      if (text.includes(needle)) notes.push(`${file}: still contains "${needle}"`)
    }
  }
  if (entry.commit !== undefined) {
    // --name-status lists full paths (plain --stat truncates long ones).
    const stat = execSync(`git show --name-status --oneline ${entry.commit}`, { encoding: 'utf8' })
    for (const path of entry['commit-must-touch'] ?? []) {
      if (!stat.includes(path)) notes.push(`commit ${entry.commit}: stat misses ${path}`)
    }
    for (const path of entry['commit-must-not-touch'] ?? []) {
      if (stat.includes(path)) notes.push(`commit ${entry.commit}: stat unexpectedly touches ${path}`)
    }
  }
  const ok = notes.length === 0
  if (!ok) failures += 1
  lines.push(`${ok ? 'PASS' : 'FAIL'} — ${entry.claim}`)
  for (const note of notes) lines.push(`    ${note}`)
}

const report = [...lines, '', `${claims.length - failures}/${claims.length} claims hold`].join('\n')
console.log(report)
if (logPath !== undefined) writeFileSync(logPath, `${report}\n`)
process.exit(failures === 0 ? 0 : 1)
