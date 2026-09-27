#!/usr/bin/env node
/**
 * Scan markdown for dangling link brackets `[text]` with no following `(`,
 * skipping fenced code blocks and inline code spans.
 * Usage: node r2-scan-brackets.mjs <file...>
 */
import { readFileSync } from 'node:fs';

let hits = 0;
for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inFence = false;
  lines.forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    // blank out inline code spans so brackets inside backticks don't match
    const line = raw.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length));
    for (const m of line.matchAll(/\[([^\[\]]*)\](?!\()/g)) {
      const after = line.slice(m.index + m[0].length);
      if (/^\[/.test(after)) continue; // reference link [text][ref]
      if (/^\^/.test(m[1])) continue; // footnote
      hits++;
      console.log(`${file}:${i + 1}: [${m[1]}]`);
      console.log(`    raw: ${raw.trim().slice(0, 120)}`);
    }
  });
}
console.log(hits === 0 ? 'CLEAN: no dangling brackets' : `TOTAL dangling: ${hits}`);
