import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const receiptName = 'module-sources.json'
const ignoredDirectories = new Set(['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache'])

export function inspectModuleSources(manifest, env = process.env) {
  const git = env.EASYLAB_GIT_BINARY || 'git'
  return manifest.modules.map(module => {
    const source = env[module.sourceEnv]
    if (!source || !existsSync(source)) throw new Error(`${module.id}: ${module.sourceEnv} must point to its source checkout.`)
    if (!/^[a-f0-9]{40}$/.test(module.sourceRevision || '')) throw new Error(`${module.id}: a full sourceRevision is required.`)
    const runGit = args => execFileSync(git, args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const root = runGit(['rev-parse', '--show-toplevel'])
    if (realpathSync(root) !== realpathSync(source)) throw new Error(`${module.id}: source path must be the repository root.`)
    const revision = runGit(['rev-parse', 'HEAD'])
    if (revision !== module.sourceRevision) throw new Error(`${module.id}: expected ${module.sourceRevision}, found ${revision}.`)
    if (runGit(['status', '--porcelain', '--untracked-files=all'])) throw new Error(`${module.id}: commit or set aside source changes before a reproducible build.`)
    return { id: module.id, revision, repository: module.repository }
  })
}

export function moduleDigest(root) {
  const digest = createHash('sha256')
  const visit = (directory, relative = '') => {
    for (const name of readdirSync(directory).sort()) {
      if (name === '.DS_Store' || /\.py[co]$/.test(name)) continue
      const filename = path.join(directory, name)
      const stat = lstatSync(filename)
      const rel = relative ? `${relative}/${name}` : name
      if (stat.isSymbolicLink()) throw new Error(`Bundle contains a symbolic link: ${rel}`)
      if (stat.isDirectory()) {
        if (!ignoredDirectories.has(name)) visit(filename, rel)
      } else if (stat.isFile()) {
        const fileHash = createHash('sha256').update(readFileSync(filename)).digest('hex')
        digest.update(`${rel}\0${fileHash}\n`)
      }
    }
  }
  visit(root)
  return digest.digest('hex')
}

export function writeModuleReceipt(suiteRoot, manifest, sources) {
  const suiteVersion = JSON.parse(readFileSync(path.join(suiteRoot, 'package.json'), 'utf8')).version
  const modules = manifest.modules.map(module => {
    const source = sources.find(source => source.id === module.id)
    if (!source) throw new Error(`${module.id}: verified source is missing.`)
    return { ...source, sha256: moduleDigest(path.join(suiteRoot, module.targetDir)) }
  })
  const receipt = { schemaVersion: 1, suiteVersion, builtAt: new Date().toISOString(), modules }
  writeFileSync(path.join(suiteRoot, 'apps', receiptName), JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

export function verifyModuleReceipt(suiteRoot, manifest) {
  const filename = path.join(suiteRoot, 'apps', receiptName)
  if (!existsSync(filename)) throw new Error('Module build receipt is missing. Run sync:apps with the pinned sources.')
  const receipt = JSON.parse(readFileSync(filename, 'utf8'))
  const version = JSON.parse(readFileSync(path.join(suiteRoot, 'package.json'), 'utf8')).version
  if (receipt.schemaVersion !== 1 || receipt.suiteVersion !== version) throw new Error('Module build receipt does not match the Suite version.')
  if (!Array.isArray(receipt.modules) || receipt.modules.length !== manifest.modules.length) throw new Error('Module build receipt does not cover every module.')
  for (const module of manifest.modules) {
    const records = receipt.modules.filter(record => record.id === module.id)
    const record = records[0]
    if (records.length !== 1 || record.revision !== module.sourceRevision || record.repository !== module.repository) throw new Error(`${module.id}: bundle source does not match its pinned revision.`)
    if (record.sha256 !== moduleDigest(path.join(suiteRoot, module.targetDir))) throw new Error(`${module.id}: bundled files changed after the verified build.`)
  }
  return receipt
}
