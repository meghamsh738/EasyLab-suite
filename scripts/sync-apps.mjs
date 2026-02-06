import { cp, mkdir, rm, access, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const shouldBuild = args.has('--build')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const suiteRoot = path.resolve(__dirname, '..')
const appsRoot = process.env.EASYLAB_APPS_ROOT || path.resolve(suiteRoot, '..')

const sourceCandidates = {
  labnotebook: [
    process.env.EASYLAB_LABNOTE_PATH,
    path.join(appsRoot, 'lab-note-taking-app'),
    path.join(appsRoot, 'lab note taking app'),
  ],
  cdna: [
    process.env.EASYLAB_CDNA_PATH,
    path.join(appsRoot, 'cDNA-calculations-app'),
    path.join(appsRoot, 'cdna-calculations-app'),
  ],
  'qpcr-planner': [
    process.env.EASYLAB_QPCR_PLANNER_PATH,
    path.join(appsRoot, 'qpcr-calculations-app-git'),
  ],
  'qpcr-analysis': [
    process.env.EASYLAB_QPCR_ANALYSIS_PATH,
    path.join(appsRoot, 'qPCR-analysis-app'),
    path.join(appsRoot, 'qpcr-analysis-app'),
  ],
  'animal-pairing': [
    process.env.EASYLAB_ANIMAL_PAIRING_PATH,
    path.join(appsRoot, 'Experiment-pairing-app'),
  ],
  breeding: [
    process.env.EASYLAB_BREEDING_PATH,
    path.join(appsRoot, 'Mice-breeding-pair-selector'),
  ],
  ymaze: [
    process.env.EASYLAB_YMAZE_PATH,
    path.join(appsRoot, 'Y-maze-randomizer'),
  ],
}

const targets = {
  labnotebook: path.join(suiteRoot, 'apps', 'labnotebook'),
  cdna: path.join(suiteRoot, 'apps', 'cdna'),
  'qpcr-planner': path.join(suiteRoot, 'apps', 'qpcr-planner'),
  'qpcr-analysis': path.join(suiteRoot, 'apps', 'qpcr-analysis'),
  'animal-pairing': path.join(suiteRoot, 'apps', 'animal-pairing'),
  breeding: path.join(suiteRoot, 'apps', 'breeding'),
  ymaze: path.join(suiteRoot, 'apps', 'ymaze'),
}

const run = (command, cwd) => {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`)
  }
}

const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`
const hasRsync = spawnSync('rsync --version', { shell: true, stdio: 'ignore' }).status === 0

const resetDir = async (dir) => {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
}

const copyDir = async (from, to) => {
  const fromStat = await stat(from)
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
    await access(target)
  } catch {
    throw new Error(`${label} not found at ${target}`)
  }
}

const pickSource = (label, candidates) => {
  const found = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!found) {
    throw new Error(`${label} source not found. Tried: ${candidates.filter(Boolean).join(', ')}`)
  }
  return found
}

const syncLabNotebook = async () => {
  const sourceRoot = pickSource('Lab Notebook source', sourceCandidates.labnotebook)

  if (shouldBuild) {
    run('npm --prefix web run build', sourceRoot)
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

  const filesToCopy = ['app.py', 'qpcr_core.py', 'mock_wells.csv', 'requirements.txt']
  for (const file of filesToCopy) {
    const sourceFile = path.join(sourceRoot, file)
    try {
      await access(sourceFile)
      await copyDir(sourceFile, path.join(targetRoot, file))
    } catch {
      // Ignore missing optional files
    }
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

const main = async () => {
  await syncLabNotebook()
  await syncCdna()
  await syncQpcrPlanner()
  await syncQpcrAnalysis()
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
  console.log('Easylab suite modules synced.')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
