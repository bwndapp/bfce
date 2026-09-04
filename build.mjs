// Builds the published bundles. Runs in the mirror repo (github.com/bwndapp/bbot),
// where `src/` is a copy of this incubator's frontend/src/face — see
// publish-face.sh, which puts this file there.
//
//   dist/face.js   the library, no framework, styles injected at runtime
//   dist/react.js  the same plus the <Face> component, react external
//   dist/fx.js     the optional effect stack — chrome, glass, neon rim, wear
//   dist/face.css  standalone stylesheet, for anyone importing raw src/
//
// Both JS bundles inject their own styles, which is why `import '@bwnd/bbot'`
// needs no <link> and no CSS import. The package entry points at dist rather
// than src on purpose: src/index.js pulls in Face.jsx, and shipping raw JSX as
// a package's main entry breaks every consumer whose bundler doesn't transpile
// node_modules — which is most of them.

import { build } from 'esbuild'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const css = readFileSync('src/face.css', 'utf8')

const INJECT = `
let injected = false
function injectStyles() {
  if (injected || typeof document === 'undefined') return
  injected = true
  const style = document.createElement('style')
  style.dataset.bwface = ''
  style.textContent = ${JSON.stringify(css)}
  document.head.appendChild(style)
}
`

// Face.jsx does its own \`import './face.css'\`, which is right for source
// consumers and wrong here — these bundles carry the CSS as a string. Swallow
// the import rather than emit a stray stylesheet the consumer must remember.
const stubCss = {
  name: 'stub-css',
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: 'stub-css' }))
    b.onLoad({ filter: /.*/, namespace: 'stub-css' }, () => ({ contents: '', loader: 'js' }))
  },
}

const entries = {
  '.build-face.js': `
${INJECT}
import { createFace as base } from './src/core.js'

export function createFace(host, options) {
  injectStyles()
  return base(host, options)
}

export { EXPRESSIONS, EXPRESSION_NAMES, REACTIONS, REACTION_NAMES } from './src/expressions.js'
`,
  '.build-fx.js': `
export { applyFx, FX_DEFAULTS, default } from './src/fx.js'
`,
  '.build-talk.js': `
export { listen, levelAt, default } from './src/talk.js'
`,
  '.build-react.js': `
${INJECT}
import { createFace as base } from './src/core.js'

// Module scope, guarded: on a server there is no document and this is skipped,
// then it runs again on the client when the module is evaluated there.
injectStyles()

export function createFace(host, options) {
  injectStyles()
  return base(host, options)
}

export { default as Face } from './src/Face.jsx'
export { EXPRESSIONS, EXPRESSION_NAMES, REACTIONS, REACTION_NAMES } from './src/expressions.js'
`,
}

mkdirSync('dist', { recursive: true })

const common = {
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  plugins: [stubCss],
}

try {
  for (const [entry, contents] of Object.entries(entries)) writeFileSync(entry, contents)

  await build({ ...common, entryPoints: ['.build-face.js'], outfile: 'dist/face.js' })
  await build({
    ...common,
    entryPoints: ['.build-react.js'],
    outfile: 'dist/react.js',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  })
  await build({ ...common, entryPoints: ['.build-fx.js'], outfile: 'dist/fx.js' })
  await build({ ...common, entryPoints: ['.build-talk.js'], outfile: 'dist/talk.js' })
  await build({ entryPoints: ['src/face.css'], minify: true, outfile: 'dist/face.css' })
} finally {
  for (const entry of Object.keys(entries)) rmSync(entry, { force: true })
}

console.log('built ' + readdirSync('dist').sort().map((f) => 'dist/' + f).join(', '))
