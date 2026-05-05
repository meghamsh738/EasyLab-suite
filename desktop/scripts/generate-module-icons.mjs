import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const cwd = path.resolve(process.cwd())
const suiteRoot = existsSync(path.join(cwd, 'desktop')) ? cwd : path.resolve(cwd, '..')
const webIconDir = path.join(suiteRoot, 'web', 'src', 'assets', 'module-icons')
const electronIconDir = path.join(suiteRoot, 'desktop', 'electron', 'icons')

const modules = [
  { id: 'labnotebook', accent: '#3156D4', kind: 'notebook' },
  { id: 'cdna', accent: '#C77916', kind: 'tube' },
  { id: 'qpcr-planner', accent: '#088B74', kind: 'plate' },
  { id: 'qpcr-analysis', accent: '#B45309', kind: 'chart' },
  { id: 'elisa-analysis', accent: '#7C3AED', kind: 'curve' },
  { id: 'animal-pairing', accent: '#2563EB', kind: 'cohort' },
  { id: 'breeding', accent: '#168451', kind: 'helix' },
  { id: 'ymaze', accent: '#C0266A', kind: 'maze' },
]

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const iconPaths = {
  notebook: `
    <rect x="38" y="29" width="52" height="70" rx="8" fill="#FFFFFF" stroke="currentColor" stroke-width="5"/>
    <path d="M49 45h30M49 60h24M49 75h30" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M39 38h-7M39 56h-7M39 74h-7" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  `,
  tube: `
    <path d="M49 25h30M57 25v25L39 84c-4 8 2 17 11 17h28c9 0 15-9 11-17L71 50V25" fill="#FFFFFF" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>
    <path d="M47 78h34" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <circle cx="58" cy="87" r="4" fill="currentColor"/>
  `,
  plate: `
    <rect x="27" y="32" width="74" height="64" rx="10" fill="#FFFFFF" stroke="currentColor" stroke-width="5"/>
    ${Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => `<circle cx="${43 + col * 11}" cy="${48 + row * 11}" r="3.2" fill="currentColor" opacity="${row === 0 || col === 4 ? '0.95' : '0.42'}"/>`).join('')
    ).join('')}
  `,
  chart: `
    <rect x="30" y="30" width="68" height="68" rx="10" fill="#FFFFFF" stroke="currentColor" stroke-width="5"/>
    <path d="M43 82V61M61 82V47M79 82V55" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    <path d="M42 43c10 9 17 9 25 0 7-8 13-8 19 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  `,
  curve: `
    <rect x="28" y="31" width="72" height="66" rx="10" fill="#FFFFFF" stroke="currentColor" stroke-width="5"/>
    <path d="M40 82c10-28 24-40 47-42" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <circle cx="44" cy="76" r="4" fill="currentColor"/><circle cx="55" cy="61" r="4" fill="currentColor"/><circle cx="70" cy="49" r="4" fill="currentColor"/><circle cx="87" cy="41" r="4" fill="currentColor"/>
  `,
  cohort: `
    <circle cx="48" cy="48" r="12" fill="#FFFFFF" stroke="currentColor" stroke-width="5"/>
    <circle cx="80" cy="48" r="12" fill="#FFFFFF" stroke="currentColor" stroke-width="5"/>
    <path d="M32 92c4-16 15-24 32-24s28 8 32 24" fill="#FFFFFF" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M64 47h0" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  `,
  helix: `
    <path d="M43 27c30 11 30 63 0 74M85 27c-30 11-30 63 0 74" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M51 40h26M48 57h32M48 74h32M51 91h26" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  `,
  maze: `
    <path d="M32 86V42h28v16h36v44H68V78H50v24H32" fill="#FFFFFF" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>
    <path d="M60 42V27h36v15" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  `,
}

const renderModuleSvg = ({ accent, kind }) => {
  const shape = (iconPaths[kind] ?? iconPaths.notebook)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0F172A" flood-opacity="0.16"/>
    </filter>
  </defs>
  <rect x="8" y="8" width="112" height="112" rx="24" fill="#F8FAFC" stroke="#D7E0EA" stroke-width="2" filter="url(#soft)"/>
  <rect x="16" y="16" width="96" height="96" rx="18" fill="#FFFFFF"/>
  <g style="color:${escapeXml(accent)}">
    ${shape}
  </g>
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
