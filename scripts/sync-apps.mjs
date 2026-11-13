import { cp, mkdir, rm, access, lstat, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { inspectModuleSources, writeModuleReceipt } from './module-sources.mjs'

const require = createRequire(import.meta.url)
const {
  assertNoSymlinkPathComponents,
  isPathInside,
  resolveIsolatedSource,
  sanitizeEnvironment,
} = require('./runtime-isolation.cjs')

const args = new Set(process.argv.slice(2))
const shouldBuild = args.has('--build')
const requireExplicitSources = args.has('--strict') || process.env.EASYLAB_REQUIRE_EXPLICIT_SOURCES === '1'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const suiteRoot = path.resolve(__dirname, '..')
const appsRoot = path.resolve(suiteRoot, '..', 'modules')

const sourceCandidates = {
  labnotebook: [
    process.env.EASYLAB_LABNOTE_PATH,
    path.join(appsRoot, 'labnotebook'),
  ],
  cdna: [
    process.env.EASYLAB_CDNA_PATH,
    path.join(appsRoot, 'cdna'),
  ],
  'qpcr-planner': [
    process.env.EASYLAB_QPCR_PLANNER_PATH,
    path.join(appsRoot, 'qpcr-planner'),
  ],
  'qpcr-analysis': [
    process.env.EASYLAB_QPCR_ANALYSIS_PATH,
    path.join(appsRoot, 'qpcr-analysis'),
  ],
  'elisa-analysis': [
    process.env.EASYLAB_ELISA_ANALYSIS_PATH,
    path.join(appsRoot, 'elisa-analysis'),
  ],
  'animal-pairing': [
    process.env.EASYLAB_ANIMAL_PAIRING_PATH,
    path.join(appsRoot, 'animal-pairing'),
  ],
  breeding: [
    process.env.EASYLAB_BREEDING_PATH,
    path.join(appsRoot, 'breeding'),
  ],
  ymaze: [
    process.env.EASYLAB_YMAZE_PATH,
    path.join(appsRoot, 'ymaze'),
  ],
}

const targets = {
  labnotebook: path.join(suiteRoot, 'apps', 'labnotebook'),
  cdna: path.join(suiteRoot, 'apps', 'cdna'),
  'qpcr-planner': path.join(suiteRoot, 'apps', 'qpcr-planner'),
  'qpcr-analysis': path.join(suiteRoot, 'apps', 'qpcr-analysis'),
  'elisa-analysis': path.join(suiteRoot, 'apps', 'elisa-analysis'),
  'animal-pairing': path.join(suiteRoot, 'apps', 'animal-pairing'),
  breeding: path.join(suiteRoot, 'apps', 'breeding'),
  ymaze: path.join(suiteRoot, 'apps', 'ymaze'),
}

const excludeMatchers = [
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)venv(\/|$)/,
  /(^|\/)\.venv(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.pytest_cache(\/|$)/,
  /(^|\/)\.mypy_cache(\/|$)/,
  /(^|\/)\.ruff_cache(\/|$)/,
  /\.pyc$/,
  /\.pyo$/,
  /(^|\/)\.DS_Store$/,
]

const run = (command, cwd) => {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: sanitizeEnvironment(process.env),
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`)
  }
}

const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`
const hasRsync = spawnSync('rsync --version', { shell: true, stdio: 'ignore', env: sanitizeEnvironment(process.env) }).status === 0

const resetDir = async (dir) => {
  if (!isPathInside(suiteRoot, dir)) throw new Error(`Generated module target escapes the Suite worktree: ${dir}`)
  assertNoSymlinkPathComponents(suiteRoot, dir)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  assertNoSymlinkPathComponents(suiteRoot, dir)
}

const assertLocalBuildOutput = (sourceRoot, relativeOutputPath) => {
  const outputPath = path.resolve(sourceRoot, relativeOutputPath)
  if (!isPathInside(sourceRoot, outputPath)) throw new Error(`Module build output escapes its source worktree: ${outputPath}`)
  assertNoSymlinkPathComponents(sourceRoot, outputPath)
}

const copyDir = async (from, to) => {
  await assertNoSymlinkTree(from)
  const fromStat = await lstat(from)

  const shouldUseRsync = hasRsync && process.platform !== 'win32'
  if (!shouldUseRsync) {
    // Cross-platform fallback for environments without rsync (e.g. Windows).
    // Also keeps packaged artifacts smaller by excluding venv/cache folders.
    const filter = (src) => {
      const normalized = String(src).replaceAll('\\', '/')
      return !excludeMatchers.some((matcher) => matcher.test(normalized))
    }
    await cp(from, to, { recursive: true, filter })
    return
  }

  // On WSL + drvfs, node's `fs.cp()` can fail with EPERM (copyfile/chmod/utime quirks).
  // Use rsync for predictable, permission-agnostic copies.
  const rsyncCommonArgs = [
    '-r',
    '--no-perms',
    '--no-owner',
    '--no-group',
    '--omit-dir-times',
    "--exclude '__pycache__/'",
    "--exclude '*.pyc'",
    "--exclude '*.pyo'",
    "--exclude '.pytest_cache/'",
    "--exclude '.mypy_cache/'",
    "--exclude '.ruff_cache/'",
    "--exclude '.venv/'",
    "--exclude 'venv/'",
    "--exclude 'node_modules/'",
    "--exclude '.DS_Store'",
  ].join(' ')

  if (fromStat.isDirectory()) {
    await mkdir(to, { recursive: true })
    // Trailing slashes are important: `rsync src/ dest/` copies contents.
    run(`rsync ${rsyncCommonArgs} ${shQuote(`${from}/`)} ${shQuote(`${to}/`)}`, suiteRoot)
    return
  }

  await mkdir(path.dirname(to), { recursive: true })
  run(`rsync ${rsyncCommonArgs} ${shQuote(from)} ${shQuote(to)}`, suiteRoot)
}

const ensureExists = async (target, label) => {
  try {
    const stat = await lstat(target)
    if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${target}`)
  } catch (error) {
    if (error && error.code === 'ENOENT') throw new Error(`${label} not found at ${target}`)
    throw error
  }
}

const isExcludedPath = (relativePath) => excludeMatchers.some((matcher) => matcher.test(relativePath))

const assertNoSymlinkTree = async (root) => {
  const visit = async (target, relative = '') => {
    const stat = await lstat(target)
    if (stat.isSymbolicLink()) throw new Error(`Refusing to copy a symlinked module artifact: ${target}`)
    if (!stat.isDirectory()) return
    for (const entry of await readdir(target, { withFileTypes: true })) {
      const nextRelative = path.posix.join(relative, entry.name)
      if (isExcludedPath(nextRelative)) continue
      if (entry.isSymbolicLink()) throw new Error(`Refusing to copy a symlinked module artifact: ${path.join(target, entry.name)}`)
      if (entry.isDirectory()) await visit(path.join(target, entry.name), nextRelative)
    }
  }
  await visit(root)
}

const pickSource = (label, candidates) => {
  let selected
  if (requireExplicitSources) {
    const explicitSource = candidates[0]
    if (!explicitSource || !existsSync(explicitSource)) {
      throw new Error(
        `${label} requires its explicit EASYLAB_*_PATH when --strict is used. ` +
          'Refusing to fall back to neighbouring source folders.',
      )
    }
    selected = explicitSource
  } else {
    selected = candidates.find((candidate) => candidate && existsSync(candidate))
    if (!selected) throw new Error(`${label} source not found under ${appsRoot}.`)
  }
  return resolveIsolatedSource(selected, appsRoot)
}

const syncLabNotebook = async () => {
  const sourceRoot = pickSource('Lab Notebook source', sourceCandidates.labnotebook)

  if (shouldBuild) {
    // Ensure file:// safe assets in Electron packaged mode.
    assertLocalBuildOutput(sourceRoot, '.labnote-dist/web')
    run('npm --prefix web run build -- --base ./', sourceRoot)
  }

  const buildDir = path.join(sourceRoot, '.labnote-dist', 'web')
  await ensureExists(buildDir, 'Lab Notebook build')

  const targetRoot = targets.labnotebook
  await resetDir(targetRoot)
  await copyDir(buildDir, path.join(targetRoot, 'web'))
}

const syncCdna = async () => {
  const sourceRoot = pickSource('cDNA source', sourceCandidates.cdna)

  if (shouldBuild) {
    // Ensure the build is file:// safe inside Electron.
    assertLocalBuildOutput(sourceRoot, '.app-dist/web')
    run('npm --prefix modern-app run build -- --base ./', sourceRoot)
  }

  const buildDirPreferred = path.join(sourceRoot, '.app-dist', 'web')
  const buildDirFallback = path.join(sourceRoot, 'modern-app', 'dist')
  const buildDir = existsSync(buildDirPreferred) ? buildDirPreferred : buildDirFallback
  const backendDir = path.join(sourceRoot, 'modern-app', 'backend')
  const exampleDir = path.join(sourceRoot, 'modern-app', 'example_data')
  await ensureExists(buildDir, 'cDNA build')
  await ensureExists(backendDir, 'cDNA backend')

  const targetRoot = targets.cdna
  await resetDir(targetRoot)
  await copyDir(buildDir, path.join(targetRoot, 'web'))
  await copyDir(backendDir, path.join(targetRoot, 'backend'))
  try {
    await access(exampleDir)
    await copyDir(exampleDir, path.join(targetRoot, 'example_data'))
  } catch {
    // optional
  }
}

const syncQpcrPlanner = async () => {
  const sourceRoot = pickSource('qPCR planner source', sourceCandidates['qpcr-planner'])

  if (shouldBuild) {
    // Ensure the build is file:// safe inside Electron.
    assertLocalBuildOutput(sourceRoot, '.app-dist/web')
    run('npm --prefix modern-app run build -- --base ./', sourceRoot)
  }

  const buildDirPreferred = path.join(sourceRoot, '.app-dist', 'web')
  const buildDirFallback = path.join(sourceRoot, 'modern-app', 'dist')
  const buildDir = existsSync(buildDirPreferred) ? buildDirPreferred : buildDirFallback
  const backendDir = path.join(sourceRoot, 'modern-app', 'backend')
  await ensureExists(buildDir, 'qPCR planner build')
  await ensureExists(backendDir, 'qPCR planner backend')

  const targetRoot = targets['qpcr-planner']
  await resetDir(targetRoot)
  await copyDir(buildDir, path.join(targetRoot, 'web'))
  await copyDir(backendDir, path.join(targetRoot, 'backend'))
}

const syncFastApiModernApp = async ({ id, label, sourceCandidates: candidates }) => {
  const sourceRoot = pickSource(`${label} source`, candidates)

  if (shouldBuild) {
    // Ensure the build is file:// safe inside Electron.
    // Vite defaults to base "/" which breaks asset paths when loaded from disk.
    assertLocalBuildOutput(sourceRoot, '.app-dist/web')
    run('npm --prefix modern-app run build -- --base ./', sourceRoot)
  }

  const buildDirPreferred = path.join(sourceRoot, '.app-dist', 'web')
  const buildDirFallback = path.join(sourceRoot, 'modern-app', 'dist')
  const backendDir = path.join(sourceRoot, 'modern-app', 'backend')
  const exampleDir = path.join(sourceRoot, 'modern-app', 'example_data')

  const buildDir = existsSync(buildDirPreferred) ? buildDirPreferred : buildDirFallback
  await ensureExists(buildDir, `${label} build`)
  await ensureExists(backendDir, `${label} backend`)

  const targetRoot = targets[id]
  await resetDir(targetRoot)
  await copyDir(buildDir, path.join(targetRoot, 'web'))
  await copyDir(backendDir, path.join(targetRoot, 'backend'))
  try {
    await access(exampleDir)
    await copyDir(exampleDir, path.join(targetRoot, 'example_data'))
  } catch {
    // optional
  }
}

const syncQpcrAnalysis = async () => {
  const sourceRoot = pickSource('qPCR analysis source', sourceCandidates['qpcr-analysis'])

  const targetRoot = targets['qpcr-analysis']
  await resetDir(targetRoot)

  const filesToCopy = [
    'app.py',
    'qpcr_core.py',
    'qpcr_workflow.py',
    'qpcr_statistics.py',
    'qpcr_io.py',
    'qpcr_graphs.py',
    'qpcr_storage.py',
    'qpcr_session.py',
    'qpcr_example.py',
    'qpcr_review_export.py',
    'mock_wells.csv',
    'requirements.txt',
  ]
  for (const file of filesToCopy) {
    const sourceFile = path.join(sourceRoot, file)
    await ensureExists(sourceFile, `qPCR analysis file ${file}`)
    await copyDir(sourceFile, path.join(targetRoot, file))
  }

  const sampleData = path.join(sourceRoot, 'sample-data')
  try {
    await access(sampleData)
    await copyDir(sampleData, path.join(targetRoot, 'sample-data'))
  } catch {
    // optional
  }

  const streamlitConfig = path.join(sourceRoot, '.streamlit')
  try {
    await access(streamlitConfig)
    await copyDir(streamlitConfig, path.join(targetRoot, '.streamlit'))
  } catch {
    // optional
  }
}

const syncElisaAnalysis = async () => {
  const sourceRoot = pickSource('ELISA analysis source', sourceCandidates['elisa-analysis'])

  if (shouldBuild) {
    // Ensure file:// safe assets in Electron
    assertLocalBuildOutput(sourceRoot, 'dist')
    run('npm run build -- --base ./', sourceRoot)
  }

  const buildDir = path.join(sourceRoot, 'dist')
  await ensureExists(buildDir, 'ELISA analysis build')

  const targetRoot = targets['elisa-analysis']
  await resetDir(targetRoot)
  await copyDir(buildDir, path.join(targetRoot, 'web'))
}

const main = async () => {
  const manifest = JSON.parse(readFileSync(path.join(suiteRoot, 'config', 'suite-modules.json'), 'utf8'))
  if (requireExplicitSources) {
    if (!shouldBuild) throw new Error('Pinned source sync requires --build so stale frontend assets cannot be recorded as current.')
    // Check every source before changing any generated module directory.
    inspectModuleSources(manifest)
  }
  await syncLabNotebook()
  await syncCdna()
  await syncQpcrPlanner()
  await syncQpcrAnalysis()
  await syncElisaAnalysis()
  await syncFastApiModernApp({
    id: 'animal-pairing',
    label: 'Animal Pairing',
    sourceCandidates: sourceCandidates['animal-pairing'],
  })
  await syncFastApiModernApp({
    id: 'breeding',
    label: 'Breeding Pair Selector',
    sourceCandidates: sourceCandidates.breeding,
  })
  await syncFastApiModernApp({
    id: 'ymaze',
    label: 'Y-Maze Randomizer',
    sourceCandidates: sourceCandidates.ymaze,
  })
  if (requireExplicitSources) writeModuleReceipt(suiteRoot, manifest, inspectModuleSources(manifest))
  console.log('Easylab suite modules synced.')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
