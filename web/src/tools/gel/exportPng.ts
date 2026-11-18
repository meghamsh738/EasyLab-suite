import { ANNOTATION_COLORS, type GelAnnotation, type GelSourceImage } from './types'

function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  return image.decode().then(() => image)
}

function roundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundedFileStem(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '')
  return (stem || 'gel-image').slice(0, 80)
}

export function labeledPngName(fileName: string): string {
  return `${roundedFileStem(fileName)}-labeled.png`
}

function paintAnnotation(context: CanvasRenderingContext2D, annotation: GelAnnotation, source: GelSourceImage): void {
  const fontSize = Math.max(16, Math.min(72, source.height * 0.032))
  const lineGap = fontSize * 0.16
  const padding = fontSize * 0.48
  const maxWidth = Math.min(source.width * 0.44, Math.max(150, fontSize * 18))
  const titleFont = `600 ${fontSize}px "IBM Plex Sans", sans-serif`
  const detailFont = `500 ${fontSize * 0.76}px "IBM Plex Sans", sans-serif`
  const noteFont = `400 ${fontSize * 0.68}px "IBM Plex Sans", sans-serif`
  const rows: Array<{ text: string; font: string; height: number }> = []

  context.font = titleFont
  rows.push({ text: annotation.label, font: titleFont, height: fontSize * 1.18 })
  if (annotation.bandSize.trim()) {
    context.font = detailFont
    rows.push({ text: annotation.bandSize.trim(), font: detailFont, height: fontSize * 0.96 })
  }
  if (annotation.note.trim()) {
    context.font = noteFont
    for (const line of wrapText(context, annotation.note, maxWidth - padding * 2)) {
      rows.push({ text: line, font: noteFont, height: fontSize * 0.88 })
    }
  }

  const boxWidth = Math.min(maxWidth, Math.max(...rows.map(row => {
    context.font = row.font
    return context.measureText(row.text).width
  })) + padding * 2)
  const boxHeight = rows.reduce((height, row) => height + row.height, padding * 2) + lineGap * (rows.length - 1)
  const centerX = annotation.x * source.width
  const centerY = annotation.y * source.height
  const x = Math.min(Math.max(centerX - boxWidth / 2, 0), source.width - boxWidth)
  const y = Math.min(Math.max(centerY - boxHeight / 2, 0), source.height - boxHeight)
  const color = ANNOTATION_COLORS[annotation.color]

  roundRectPath(context, x, y, boxWidth, boxHeight, fontSize * 0.22)
  context.fillStyle = color.background
  context.fill()
  context.lineWidth = Math.max(2, fontSize * 0.075)
  context.strokeStyle = color.border
  context.stroke()

  let rowY = y + padding
  context.textBaseline = 'top'
  context.textAlign = 'left'
  context.fillStyle = '#172e35'
  for (const row of rows) {
    context.font = row.font
    context.fillText(row.text, x + padding, rowY, maxWidth - padding * 2)
    rowY += row.height + lineGap
  }
}

export async function renderLabeledPng(source: GelSourceImage, annotations: GelAnnotation[]): Promise<Blob> {
  const image = await loadImage(source.url)
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('A PNG image could not be created in this browser.')
  context.drawImage(image, 0, 0, source.width, source.height)
  for (const annotation of annotations) paintAnnotation(context, annotation, source)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('The labeled PNG could not be encoded.'))
    }, 'image/png')
  })
}
