// Desktop tools: what the bot can do on this machine, run here on request
// from its container over the bwnd socket. Every tool is read-only and
// scoped to the roots the user allowed in ✎ → config → desktop; a path
// outside them is refused, not resolved. The manifest is MCP-shaped
// (name / description / input_schema) so bwnd can hand it to the agent
// verbatim, and results are MCP content blocks.

const fs = require('fs')
const path = require('path')
const os = require('os')

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '__pycache__', '.cache', 'dist', 'build', 'target', 'vendor',
  '.venv', 'venv', 'env', 'Library', 'bin', 'obj', '.next', '.nuxt', 'coverage', 'Pods', 'DerivedData',
])
const TEXT_EXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.log', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb',
  '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.sh', '.ps1', '.bat', '.cmd', '.sql',
  '.env', '.gitignore', '.tex', '.rtf', '.srt', '.vtt',
])
const WALK_BUDGET = 150000 // entries visited per search, then stop
const WALK_MS = 8000
const READ_CAP = 60000 // chars

const DEFAULT_ROOTS = () => ['Documents', 'Desktop', 'Downloads'].map((d) => path.join(os.homedir(), d))

// --- scoping ---
const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase()
function inRoots(p, roots) {
  const n = norm(p)
  return roots.some((r) => {
    const rn = norm(r)
    return n === rn || n.startsWith(rn + path.sep)
  })
}
function resolveIn(p, roots) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('path required')
  // errors name the roots, so an agent holding a stale or guessed path
  // (another machine's user folder, an old thread) corrects itself next call
  const allowed = `allowed folders: ${roots.join(', ')}`
  let real = path.resolve(p)
  try {
    real = fs.realpathSync(real) // a symlink out of the roots is still out
  } catch {
    throw new Error(`not found: ${p} — ${allowed}`)
  }
  if (!inRoots(real, roots)) throw new Error(`outside the allowed folders: ${p} — ${allowed}`)
  return real
}

// --- matching: "*.pdf", "report", "q3 report" (all words), case-insensitive ---
function matcher(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return () => true
  if (/[*?]/.test(q)) {
    const re = new RegExp('^' + q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    return (name) => re.test(name.toLowerCase())
  }
  const words = q.split(/\s+/)
  return (name) => {
    const n = name.toLowerCase()
    return words.every((w) => n.includes(w))
  }
}

const iso = (d) => new Date(d).toISOString()
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)

// --- the tools ---
const TOOLS = {
  search_files: {
    description:
      "Search the user's desktop folders for files by name. Supports plain words (all must appear in the file name), " +
      'or a glob like *.pdf. Filter by how recently the file was modified. Returns paths, sizes and modified times, ' +
      'newest first. Use this to find "that report from last week" and give the user the path.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'words in the file name, or a glob such as *.xlsx; empty for everything' },
        modified_within_days: { type: 'number', description: 'only files modified in the last N days' },
        extensions: { type: 'array', items: { type: 'string' }, description: 'e.g. ["pdf","docx"]' },
        folder: { type: 'string', description: 'limit to this folder (must be inside an allowed root); default: all roots' },
        limit: { type: 'number', description: 'max results, default 25' },
      },
    },
    run(input, ctx) {
      const match = matcher(input.query)
      const since = input.modified_within_days > 0 ? Date.now() - input.modified_within_days * 86400000 : 0
      const exts = Array.isArray(input.extensions) && input.extensions.length
        ? new Set(input.extensions.map((e) => '.' + String(e).replace(/^\./, '').toLowerCase()))
        : null
      const limit = Math.max(1, Math.min(200, +input.limit || 25))
      const roots = input.folder ? [resolveIn(input.folder, ctx.roots)] : ctx.roots.filter((r) => fs.existsSync(r))
      const hits = []
      let visited = 0
      let truncated = false
      const t0 = Date.now()
      // breadth-first, so a cut-short search has still seen every root's top
      // levels (where the documents live) before it drowns in some deep tree
      const queue = roots.map((r) => ({ dir: r, depth: 0 }))
      let qi = 0
      while (qi < queue.length) {
        if (visited > WALK_BUDGET || Date.now() - t0 > WALK_MS) {
          truncated = true
          break
        }
        const { dir, depth } = queue[qi++]
        let ents
        try {
          ents = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const e of ents) {
          visited++
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            if (depth < 12 && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) queue.push({ dir: full, depth: depth + 1 })
            continue
          }
          if (!e.isFile()) continue
          if (exts && !exts.has(path.extname(e.name).toLowerCase())) continue
          if (!match(e.name)) continue
          let st
          try {
            st = fs.statSync(full)
          } catch {
            continue
          }
          if (since && st.mtimeMs < since) continue
          hits.push({ path: full, size: st.size, modified: st.mtimeMs })
        }
      }
      hits.sort((a, b) => b.modified - a.modified)
      const out = hits.slice(0, limit)
      const lines = out.map((h) => `${h.path}  (${fmtSize(h.size)}, modified ${iso(h.modified)})`)
      const head = out.length
        ? `${out.length}${hits.length > out.length ? ` of ${hits.length}` : ''} file(s)${truncated ? ' (search cut short — narrow it down)' : ''}:`
        : `no files matched${truncated ? ' before the search was cut short — narrow it down' : ''}.`
      return { text: [head, ...lines].join('\n'), meta: { files: out, truncated } }
    },
  },

  list_dir: {
    description: 'List the entries of a folder inside the allowed roots. With no path, lists the allowed roots themselves.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } } },
    run(input, ctx) {
      if (!input.path) return { text: ['allowed folders:', ...ctx.roots].join('\n') }
      const dir = resolveIn(input.path, ctx.roots)
      const ents = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 500)
      const lines = ents.map((e) => {
        if (e.isDirectory()) return `${e.name}/`
        try {
          const st = fs.statSync(path.join(dir, e.name))
          return `${e.name}  (${fmtSize(st.size)}, modified ${iso(st.mtimeMs)})`
        } catch {
          return e.name
        }
      })
      return { text: [`${dir}:`, ...lines].join('\n') }
    },
  },

  read_file: {
    description:
      'Read a text file inside the allowed roots (notes, code, csv, json, markdown…). Returns up to max_chars from ' +
      'the start. Binary formats such as pdf, docx or images are not read; only their size is reported.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        max_chars: { type: 'number', description: 'default 8000, max 60000' },
      },
      required: ['path'],
    },
    run(input, ctx) {
      const file = resolveIn(input.path, ctx.roots)
      const st = fs.statSync(file)
      if (!st.isFile()) throw new Error('not a file')
      const ext = path.extname(file).toLowerCase()
      const cap = Math.max(200, Math.min(READ_CAP, +input.max_chars || 8000))
      const fd = fs.openSync(file, 'r')
      let buf
      try {
        buf = Buffer.alloc(Math.min(st.size, cap * 4))
        fs.readSync(fd, buf, 0, buf.length, 0)
      } finally {
        fs.closeSync(fd)
      }
      const looksBinary = !TEXT_EXT.has(ext) && buf.subarray(0, 2048).includes(0)
      if (looksBinary)
        return { text: `${file} is a binary ${ext || 'file'} (${fmtSize(st.size)}) — open it with open_path instead.` }
      let text = buf.toString('utf8')
      const cut = text.length > cap
      if (cut) text = text.slice(0, cap)
      return { text: `${file} (${fmtSize(st.size)}${cut ? `, first ${cap} chars` : ''}):\n${text}` }
    },
  },

  open_path: {
    description: "Open a file or folder on the user's desktop with its default app, or reveal it in the file manager.",
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        reveal: { type: 'boolean', description: 'true = show in the file manager instead of opening' },
      },
      required: ['path'],
    },
    async run(input, ctx) {
      const target = resolveIn(input.path, ctx.roots)
      if (!ctx.shell) throw new Error('no shell')
      if (input.reveal) {
        ctx.shell.showItemInFolder(target)
        return { text: `revealed ${target}` }
      }
      const err = await ctx.shell.openPath(target)
      if (err) throw new Error(err)
      return { text: `opened ${target}` }
    },
  },
}

// the manifest the bridge announces: MCP tool shape, nothing else
const manifest = () =>
  Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema }))

// run one request → MCP result { content: [{type:'text', text}], is_error? }
async function run(name, input, ctx) {
  const t = TOOLS[name]
  if (!t) return { content: [{ type: 'text', text: `unknown tool: ${name}` }], is_error: true }
  const roots = (ctx.roots && ctx.roots.length ? ctx.roots : DEFAULT_ROOTS()).map((r) => path.resolve(r))
  try {
    const r = await t.run(input || {}, { ...ctx, roots })
    return { content: [{ type: 'text', text: r.text }], meta: r.meta }
  } catch (e) {
    return { content: [{ type: 'text', text: e?.message || 'failed' }], is_error: true }
  }
}

// a one-line, human read of a call, for the chat log
function describe(name, input = {}) {
  switch (name) {
    case 'search_files': {
      const bits = [input.query ? `"${input.query}"` : 'everything']
      if (input.extensions?.length) bits.push(input.extensions.join('/'))
      if (input.modified_within_days) bits.push(`last ${input.modified_within_days} days`)
      if (input.folder) bits.push(`in ${input.folder}`)
      return `searched files for ${bits.join(', ')}`
    }
    case 'list_dir':
      return `listed ${input.path || 'the allowed folders'}`
    case 'read_file':
      return `read ${input.path}`
    case 'open_path':
      return `${input.reveal ? 'revealed' : 'opened'} ${input.path}`
    default:
      return `ran ${name}`
  }
}

module.exports = { manifest, run, describe, DEFAULT_ROOTS }
