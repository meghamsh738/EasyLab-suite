export const PROJECT_FORMAT = 'easylab-gel-labeler'
export const PROJECT_VERSION = 1

export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024
export const MAX_PROJECT_FILE_BYTES = 30 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 24_000_000
export const MAX_IMAGE_SIDE = 12_000
export const MAX_ANNOTATIONS = 200
export const MAX_LABEL_LENGTH = 80
export const MAX_BAND_SIZE_LENGTH = 36
export const MAX_NOTE_LENGTH = 180

export const ANNOTATION_COLORS = {
  yellow: { name: 'Yellow', background: '#f8e66c', border: '#4f4300' },
  mint: { name: 'Mint', background: '#8ee0c2', border: '#164d3d' },
  blue: { name: 'Blue', background: '#a9d6ff', border: '#164b72' },
  rose: { name: 'Rose', background: '#ffc0b8', border: '#71332e' },
} as const

export type AnnotationColor = keyof typeof ANNOTATION_COLORS
export type AnnotationKind = 'lane' | 'band'

export type GelAnnotation = {
  id: string
  kind: AnnotationKind
  x: number
  y: number
  label: string
  bandSize: string
  note: string
  color: AnnotationColor
}

export type GelSourceImage = {
  fileName: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  blob: Blob
  url: string
  width: number
  height: number
}

export type GelProject = {
  source: GelSourceImage
  annotations: GelAnnotation[]
}
