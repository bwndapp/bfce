// Produces dist/face.js — the whole library in one file, with the stylesheet
// injected at runtime, so it can be dropped into a page with no build step and
// no separate <link>.

import { build } from 'esbuild'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const css = readFileSync('src/face.css', 'utf8')
const entry = '.build-entry.js'

mkdirSync('dist', { recursive: true })

writeFileSync(entry, `
import { createFace as base } from './src/core.js'

let injected = false
function injectStyles() {
  if (injected || typeof document === 'undefined') return
  injected = true
  const style = document.createElement('style')
  style.dataset.bwface = ''
  style.textContent = ${JSON.stringify(css)}
  document.head.appendChild(style)
}

export function createFace(host, options) {
  injectStyles()
  return base(host, options)
}

export {
  EXPRESSIONS,
  EXPRESSION_NAMES,
  REACTIONS,
  REACTION_NAMES,
} from './src/expressions.js'
`)

try {
  await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    outfile: 'dist/face.js',
  })

  await build({
    entryPoints: ['src/face.css'],
    minify: true,
    outfile: 'dist/face.css',
  })
} finally {
  rmSync(entry, { force: true })
}

console.log('built dist/face.js and dist/face.css')
