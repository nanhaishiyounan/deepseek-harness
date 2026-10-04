import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/labels.js',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'info',
})
console.log('labels build: dist/labels.js written (served by approval-engine --serve at /labels)')
