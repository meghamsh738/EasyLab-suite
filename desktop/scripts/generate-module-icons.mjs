import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const cwd = path.resolve(process.cwd())
const suiteRoot = existsSync(path.join(cwd, 'desktop')) ? cwd : path.resolve(cwd, '..')
const webIconDir = path.join(suiteRoot, 'web', 'src', 'assets', 'module-icons')
const electronIconDir = path.join(suiteRoot, 'desktop', 'electron', 'icons')

const modules = [
  { id: 'labnotebook', accent: '#8B79FF', label: 'LN' },
  { id: 'cdna', accent: '#E59A2F', label: 'CD' },
  { id: 'qpcr-planner', accent: '#1AAE9A', label: 'QP' },
  { id: 'qpcr-analysis', accent: '#D86A21', label: 'QA' },
  { id: 'elisa-analysis', accent: '#8C52FF', label: 'EL' },
  { id: 'animal-pairing', accent: '#1A73E8', label: 'AP' },
  { id: 'breeding', accent: '#1FA36B', label: 'BP' },
  { id: 'ymaze', accent: '#E6499A', label: 'YM' },
]

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const renderModuleSvg = ({ accent, label }) => {
  const safeLabel = escapeXml(label)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.98" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.78" />
    </linearGradient>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#EEF2FF" />
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="116" height="116" rx="32" fill="url(#bg)" />
  <rect x="10" y="10" width="108" height="108" rx="28" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2" />
  <text x="64" y="73" text-anchor="middle" fill="url(#fg)" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="1.2">${safeLabel}</text>
</svg>
`
}

const ensureSuiteIcon = async () => {
  const suitePngPath = path.join(electronIconDir, 'suite.png')
  const buildPng = path.join(suiteRoot, 'desktop', 'build', 'icon.png')
  const buildSvg = path.join(suiteRoot, 'desktop', 'build', 'icon.svg')

  if (existsSync(buildPng)) {
    const pngBuffer = await readFile(buildPng)
    await writeFile(suitePngPath, pngBuffer)
    return suitePngPath
  }

  await access(buildSvg)
  const svgBuffer = await readFile(buildSvg)
  const pngBuffer = await sharp(svgBuffer).resize(256, 256).png().toBuffer()
  await writeFile(suitePngPath, pngBuffer)
  return suitePngPath
}

await mkdir(webIconDir, { recursive: true })
await mkdir(electronIconDir, { recursive: true })

for (const module of modules) {
  const svg = renderModuleSvg(module)
  const svgBuffer = Buffer.from(svg, 'utf8')
  const webPath = path.join(webIconDir, `${module.id}.svg`)
  const electronPath = path.join(electronIconDir, `${module.id}.png`)
  await writeFile(webPath, svgBuffer)
  const pngBuffer = await sharp(svgBuffer).resize(256, 256).png().toBuffer()
  await writeFile(electronPath, pngBuffer)
}

const suiteIconPath = await ensureSuiteIcon()
console.log(`Generated ${modules.length} module icons in ${webIconDir} and ${electronIconDir}`)
console.log(`Generated suite fallback icon at ${suiteIconPath}`)
