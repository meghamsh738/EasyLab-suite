import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const suiteRoot = path.resolve(__dirname, '..')
const appsRoot = process.env.EASYLAB_APPS_ROOT || path.resolve(suiteRoot, '..')
const strict = process.argv.includes('--strict')
const requireArtifacts = process.argv.includes('--require-artifacts')

const read = (relPath) => readFileSync(path.join(suiteRoot, relPath), 'utf8')
const toSet = (arr) => new Set(arr)
const toSorted = (setLike) => Array.from(setLike).sort((a, b) => a.localeCompare(b))

const extractSyncKeys = (syncSource, objectName) => {
  const startToken = `const ${objectName} = {`
  const start = syncSource.indexOf(startToken)
  if (start < 0) return []
  const tail = syncSource.slice(start + startToken.length)
  const end = tail.indexOf('\n}\n')
  if (end < 0) return []
  const body = tail.slice(0, end)
  const keys = []
  for (const match of body.matchAll(/^\s*'?(?<key>[a-z0-9-]+)'?\s*:/gm)) {
    keys.push(match.groups.key)
  }
  return keys
}

const extractAppModuleIds = (appSource) => {
  const startToken = 'const MODULES:'
  const start = appSource.indexOf(startToken)
  if (start < 0) return []
  const tail = appSource.slice(start)
  const end = tail.indexOf('\n]\n\nconst fallbackInfo')
  if (end < 0) return []
  const body = tail.slice(0, end)
  const ids = []
  for (const match of body.matchAll(/id:\s*'(?<id>[a-z0-9-]+)'/g)) {
    ids.push(match.groups.id)
  }
  return ids
}

const extractMainModuleIds = (mainSource) => {
  const startToken = 'const MODULES = {'
  const start = mainSource.indexOf(startToken)
  if (start < 0) return []
  const tail = mainSource.slice(start + startToken.length)
  const end = tail.indexOf('\n}\n\nconst windows')
  if (end < 0) return []
  const body = tail.slice(0, end)
  const keys = []
  for (const match of body.matchAll(/^\s*'?(?<key>[a-z0-9-]+)'?\s*:\s*{/gm)) {
    keys.push(match.groups.key)
  }
  return keys
}

const extractViteEnvModuleIds = (viteEnvSource) => {
  const signatureMatch = viteEnvSource.match(/launchModule:\s*\([\s\S]*?=>\s*Promise<void>/m)
  if (!signatureMatch) return []
  const signature = signatureMatch[0]
  const ids = []
  for (const match of signature.matchAll(/'(?<id>[a-z0-9-]+)'/g)) {
    ids.push(match.groups.id)
  }
  return ids
}

const checkRuntimeArtifacts = (moduleRoot, runtimeType) => {
  const required = runtimeType === 'streamlit'
    ? ['app.py']
    : runtimeType === 'fastapi'
      ? ['web/index.html', 'backend/main.py']
      : ['web/index.html']

  return required.map((relPath) => ({
    relPath,
    exists: existsSync(path.join(moduleRoot, relPath)),
  }))
}

const setDiff = (lhs, rhs) => {
  const out = new Set()
  for (const item of lhs) {
    if (!rhs.has(item)) out.add(item)
  }
  return out
}

const manifest = JSON.parse(read('config/suite-modules.json'))
const appSource = read('web/src/App.tsx')
const mainSource = read('desktop/electron/main.cjs')
const syncSource = read('scripts/sync-apps.mjs')
const viteEnvSource = read('web/src/vite-env.d.ts')

const manifestIds = manifest.modules.map((m) => m.id)
const manifestSet = toSet(manifestIds)

const appSet = toSet(extractAppModuleIds(appSource))
const mainSet = toSet(extractMainModuleIds(mainSource))
const viteEnvSet = toSet(extractViteEnvModuleIds(viteEnvSource))
const syncSourceSet = toSet(extractSyncKeys(syncSource, 'sourceCandidates'))
const syncTargetSet = toSet(extractSyncKeys(syncSource, 'targets'))

const surfaceChecks = [
  { name: 'web launcher modules', set: appSet },
  { name: 'web module typings (vite-env)', set: viteEnvSet },
  { name: 'desktop MODULES', set: mainSet },
  { name: 'sync sourceCandidates', set: syncSourceSet },
  { name: 'sync targets', set: syncTargetSet },
]

const mismatches = []
for (const surface of surfaceChecks) {
  const missing = setDiff(manifestSet, surface.set)
  const extra = setDiff(surface.set, manifestSet)
  if (missing.size || extra.size) {
    mismatches.push({
      surface: surface.name,
      missing: toSorted(missing),
      extra: toSorted(extra),
    })
  }
}

const moduleArtifactChecks = manifest.modules.map((module) => {
  const moduleRoot = path.join(suiteRoot, module.targetDir)
  const rootExists = existsSync(moduleRoot)
  const artifacts = rootExists ? checkRuntimeArtifacts(moduleRoot, module.runtimeType) : []
  const missingArtifacts = artifacts.filter((a) => !a.exists).map((a) => a.relPath)
  return {
    id: module.id,
    rootExists,
    missingArtifacts,
    ok: rootExists && missingArtifacts.length === 0,
  }
})

const defaultSourceChecks = manifest.modules.map((module) => {
  const fromEnv = process.env[module.sourceEnv]
  const envPath = fromEnv ? path.resolve(fromEnv) : null
  const envExists = !!envPath && existsSync(envPath)
  const hintCandidates = module.sourceHints.map((hint) => path.join(appsRoot, hint))
  const resolvedHint = hintCandidates.find((candidate) => existsSync(candidate)) || null
  const resolved = envExists ? envPath : resolvedHint
  return {
    id: module.id,
    sourceEnv: module.sourceEnv,
    resolved: resolved ?? 'MISSING',
    ok: !!resolved,
  }
})

const iconChecks = [
  'desktop/build/icon.ico',
  'desktop/build/icon.png',
  'desktop/build/icon.svg',
].map((relPath) => ({
  relPath,
  exists: existsSync(path.join(suiteRoot, relPath)),
}))

const artifactIssues = requireArtifacts ? moduleArtifactChecks.filter((m) => !m.ok) : []
const sourceIssues = defaultSourceChecks.filter((m) => !m.ok)
const iconIssues = iconChecks.filter((c) => !c.exists)

const errors = []
if (mismatches.length) errors.push('manifest/surface mismatch')
if (requireArtifacts && artifactIssues.length) errors.push('packaged apps missing artifacts')
if (sourceIssues.length) errors.push('default source path resolution failed')
if (iconIssues.length) errors.push('suite icon assets missing')

console.log('=== Easylab Suite Phase 0 Preflight ===')
console.log(`Suite root: ${suiteRoot}`)
console.log(`Apps root:  ${appsRoot}`)
console.log(`Manifest modules: ${manifestIds.length} -> ${manifestIds.join(', ')}`)
console.log('')

if (mismatches.length === 0) {
  console.log('Surface wiring: OK')
} else {
  console.log('Surface wiring: FAIL')
  for (const mismatch of mismatches) {
    console.log(`- ${mismatch.surface}`)
    console.log(`  missing: ${mismatch.missing.length ? mismatch.missing.join(', ') : '(none)'}`)
    console.log(`  extra:   ${mismatch.extra.length ? mismatch.extra.join(', ') : '(none)'}`)
  }
}

console.log('')
if (requireArtifacts) {
  console.log('Packaged apps check:')
  for (const check of moduleArtifactChecks) {
    if (check.ok) {
      console.log(`- ${check.id}: OK`)
    } else {
      const missingBits = []
      if (!check.rootExists) missingBits.push('module folder missing')
      if (check.missingArtifacts.length) missingBits.push(`missing artifacts: ${check.missingArtifacts.join(', ')}`)
      console.log(`- ${check.id}: FAIL (${missingBits.join('; ')})`)
    }
  }
} else {
  console.log('Packaged apps check: skipped (run with --require-artifacts)')
}

console.log('')
console.log('Default source path resolution:')
for (const check of defaultSourceChecks) {
  console.log(`- ${check.id}: ${check.ok ? 'OK' : 'FAIL'} -> ${check.resolved}`)
}

console.log('')
console.log('Suite icon assets:')
for (const check of iconChecks) {
  console.log(`- ${check.relPath}: ${check.exists ? 'OK' : 'MISSING'}`)
}

if (errors.length) {
  console.log('')
  console.log(`Preflight summary: FAIL (${errors.join('; ')})`)
  process.exit(strict ? 1 : 0)
}

console.log('')
console.log('Preflight summary: PASS')
