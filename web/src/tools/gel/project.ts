import {
  ANNOTATION_COLORS,
  MAX_ANNOTATIONS,
  MAX_BAND_SIZE_LENGTH,
  MAX_IMAGE_FILE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PROJECT_FILE_BYTES,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  type AnnotationColor,
  type GelAnnotation,
  type GelProject,
  type GelSourceImage,
} from './types'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

const MIME_BY_EXTENSION: Record<string, AllowedMimeType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function safeImageName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop()?.trim() ?? ''
  return leaf.slice(0, 180) || 'gel-image'
}

function getImageMimeType(file: File): AllowedMimeType {
  if (ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    return file.type as AllowedMimeType
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const inferred = MIME_BY_EXTENSION[extension]
  if ((!file.type || file.type === 'application/octet-stream') && inferred) return inferred

  throw new Error('Choose a PNG, JPEG, or WebP image.')
}

function validateImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('The selected image has invalid dimensions.')
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('This image is too large to label safely. Use an image no larger than 12,000 pixels on either side and 24 megapixels total.')
  }
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    throw new Error('The file could not be decoded as a supported image.')
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('The file does not contain a readable image.')
  }
  return image
}

async function createSourceImage(
  blob: Blob,
  fileName: string,
  mimeType: AllowedMimeType,
): Promise<GelSourceImage> {
  const url = URL.createObjectURL(blob)
  try {
    const image = await decodeImage(url)
    validateImageDimensions(image.naturalWidth, image.naturalHeight)
    return {
      fileName: safeImageName(fileName),
      mimeType,
      blob,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export async function loadImageFile(file: File): Promise<GelSourceImage> {
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error('Choose an image smaller than 20 MB.')
  }
  const mimeType = getImageMimeType(file)
  const imageBlob = file.type === mimeType ? file : new Blob([file], { type: mimeType })
  return createSourceImage(imageBlob, file.name, mimeType)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readAnnotation(value: unknown, index: number, usedIds: Set<string>): GelAnnotation {
  if (!isRecord(value)) throw new Error(`Label ${index + 1} is invalid.`)

  const { id, kind, x, y, label, bandSize, note, color } = value
  if (typeof id !== 'string' || !id || id.length > 120 || usedIds.has(id)) {
    throw new Error(`Label ${index + 1} has an invalid or repeated ID.`)
  }
  if (kind !== 'lane' && kind !== 'band') throw new Error(`Label ${index + 1} has an unknown type.`)
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1 || typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1) {
    throw new Error(`Label ${index + 1} has an invalid position.`)
  }
  if (typeof label !== 'string' || !label.trim() || label.length > MAX_LABEL_LENGTH) {
    throw new Error(`Label ${index + 1} needs a name of 1–${MAX_LABEL_LENGTH} characters.`)
  }
  if (typeof bandSize !== 'string' || bandSize.length > MAX_BAND_SIZE_LENGTH) {
    throw new Error(`Label ${index + 1} has an invalid band-size field.`)
  }
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Label ${index + 1} has an invalid note.`)
  }
  if (typeof color !== 'string' || !Object.hasOwn(ANNOTATION_COLORS, color)) {
    throw new Error(`Label ${index + 1} has an unknown label color.`)
  }

  usedIds.add(id)
  return { id, kind, x, y, label, bandSize, note, color: color as AnnotationColor }
}

function imageBlobFromDataUrl(value: unknown, expectedMimeType: unknown): { blob: Blob; mimeType: AllowedMimeType } {
  if (typeof value !== 'string' || value.length > MAX_PROJECT_FILE_BYTES) {
    throw new Error('The project image is missing or too large.')
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new Error('The project image must use PNG, JPEG, or WebP encoding.')

  const mimeType = match[1] as AllowedMimeType
  const encodedBytes = match[2]
  if (mimeType !== expectedMimeType || encodedBytes.length % 4 !== 0) {
    throw new Error('The project image type or encoding is inconsistent.')
  }
  const estimatedBytes = Math.floor(encodedBytes.length * 3 / 4) - (encodedBytes.endsWith('==') ? 2 : encodedBytes.endsWith('=') ? 1 : 0)
  if (!estimatedBytes || estimatedBytes > MAX_IMAGE_FILE_BYTES) {
    throw new Error('The project image is larger than 20 MB.')
  }

  let binary: string
  try {
    binary = atob(encodedBytes)
  } catch {
    throw new Error('The project image has invalid base64 data.')
  }
  if (binary.length !== estimatedBytes) throw new Error('The project image has invalid base64 data.')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { blob: new Blob([bytes], { type: mimeType }), mimeType }
}

export async function readProjectFile(file: File): Promise<GelProject> {
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('Choose a project file smaller than 30 MB.')

  let sourceUrl: string | null = null
  try {
    const contents = JSON.parse(await file.text()) as unknown
    if (!isRecord(contents) || contents.format !== PROJECT_FORMAT || contents.version !== PROJECT_VERSION || !isRecord(contents.source)) {
      throw new Error('This is not a supported Gel Labeler project file.')
    }

    const sourceRecord = contents.source
    if (typeof sourceRecord.fileName !== 'string' || !sourceRecord.fileName.trim() || typeof sourceRecord.mimeType !== 'string') {
      throw new Error('The project is missing its original image details.')
    }
    const { blob, mimeType } = imageBlobFromDataUrl(sourceRecord.dataUrl, sourceRecord.mimeType)
    const source = await createSourceImage(blob, sourceRecord.fileName, mimeType)
    sourceUrl = source.url
    if (sourceRecord.width !== source.width || sourceRecord.height !== source.height) {
      throw new Error('The image dimensions in the project do not match the embedded original.')
    }

    if (!Array.isArray(contents.annotations) || contents.annotations.length > MAX_ANNOTATIONS) {
      throw new Error(`A project can contain up to ${MAX_ANNOTATIONS} labels.`)
    }
    const usedIds = new Set<string>()
    const annotations = contents.annotations.map((annotation, index) => readAnnotation(annotation, index, usedIds))
    return { source, annotations }
  } catch (error) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (error instanceof SyntaxError) throw new Error('The project file is not valid JSON.')
    throw error
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('The image could not be prepared for the project file.'))
    }
    reader.onerror = () => reject(new Error('The image could not be prepared for the project file.'))
    reader.readAsDataURL(blob)
  })
}

export async function createProjectJson(project: GelProject): Promise<Blob> {
  if (project.source.blob.size > MAX_IMAGE_FILE_BYTES) throw new Error('The original image is larger than 20 MB.')
  if (project.annotations.length > MAX_ANNOTATIONS) throw new Error(`A project can contain up to ${MAX_ANNOTATIONS} labels.`)
  const usedIds = new Set<string>()
  const annotations = project.annotations.map((annotation, index) => readAnnotation(annotation, index, usedIds))
  const dataUrl = await blobToDataUrl(project.source.blob)
  const json = JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    source: {
      fileName: project.source.fileName,
      mimeType: project.source.mimeType,
      width: project.source.width,
      height: project.source.height,
      dataUrl,
    },
    annotations,
  }, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  if (blob.size > MAX_PROJECT_FILE_BYTES) throw new Error('The editable project is larger than 30 MB and could not be saved.')
  return blob
}
