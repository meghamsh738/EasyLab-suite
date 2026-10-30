import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { inspectModuleSources, writeModuleReceipt, verifyModuleReceipt } from './module-sources.mjs'

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'easylab-sources-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'source')
  const suite = path.join(root, 'suite')
  mkdirSync(source)
  mkdirSync(path.join(suite, 'apps', 'example'), { recursive: true })
  writeFileSync(path.join(source, 'main.py'), 'print("example")\n')
  writeFileSync(path.join(suite, 'package.json'), JSON.stringify({ version: '0.2.1' }))
  writeFileSync(path.join(suite, 'apps', 'example', 'index.html'), '<h1>Example</h1>')
  const git = process.env.EASYLAB_GIT_BINARY || 'git'
  const run = args => execFileSync(git, args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  run(['init', '-q'])
  run(['config', 'user.name', 'EasyLab QA'])
  run(['config', 'user.email', 'qa@example.invalid'])
  run(['add', 'main.py'])
  run(['commit', '-qm', 'Example source'])
  const manifest = { modules: [{ id: 'example', repository: 'example/source', sourceEnv: 'EASYLAB_TEST_PATH', sourceRevision: run(['rev-parse', 'HEAD']), targetDir: 'apps/example' }] }
  return { source, suite, manifest, env: { ...process.env, EASYLAB_TEST_PATH: source }, run }
}

test('clean pinned sources and their generated module receipt verify', t => {
  const f = fixture(t)
  const sources = inspectModuleSources(f.manifest, f.env)
  const receipt = writeModuleReceipt(f.suite, f.manifest, sources)
  assert.deepEqual(verifyModuleReceipt(f.suite, f.manifest), receipt)
})

test('a missing source or different revision cannot silently use another checkout', t => {
  const f = fixture(t)
  assert.throws(() => inspectModuleSources(f.manifest, { ...f.env, EASYLAB_TEST_PATH: path.join(f.source, 'missing') }), /must point/)
  f.manifest.modules[0].sourceRevision = '0'.repeat(40)
  assert.throws(() => inspectModuleSources(f.manifest, f.env), /expected .*found/)
})

test('tracked edits and untracked source files block a reproducible build', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.source, 'main.py'), 'print("changed")\n')
  assert.throws(() => inspectModuleSources(f.manifest, f.env), /source changes/)
  f.run(['checkout', '--', 'main.py'])
  writeFileSync(path.join(f.source, 'unreviewed.py'), 'print("new")\n')
  assert.throws(() => inspectModuleSources(f.manifest, f.env), /source changes/)
})

test('changed bundle contents or source revisions invalidate the receipt', t => {
  const f = fixture(t)
  writeModuleReceipt(f.suite, f.manifest, inspectModuleSources(f.manifest, f.env))
  writeFileSync(path.join(f.suite, 'apps', 'example', 'index.html'), '<h1>Changed</h1>')
  assert.throws(() => verifyModuleReceipt(f.suite, f.manifest), /files changed/)
  f.manifest.modules[0].sourceRevision = '0'.repeat(40)
  assert.throws(() => verifyModuleReceipt(f.suite, f.manifest), /pinned revision/)
})

test('runtime Python caches do not change the verified source content', t => {
  const f = fixture(t)
  const receipt = writeModuleReceipt(f.suite, f.manifest, inspectModuleSources(f.manifest, f.env))
  const cache = path.join(f.suite, 'apps', 'example', '__pycache__')
  mkdirSync(cache)
  writeFileSync(path.join(cache, 'main.cpython-39.pyc'), 'runtime cache')
  assert.deepEqual(verifyModuleReceipt(f.suite, f.manifest), receipt)
})
