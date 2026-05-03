import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(webRoot, '..', '.suite-dist', 'web')

mkdirSync(outputDir, { recursive: true })

for (const filename of ['suite-icon.svg', 'vite.svg']) {
  copyFileSync(path.join(webRoot, 'public', filename), path.join(outputDir, filename))
}
