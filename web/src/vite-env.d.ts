/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    launchModule: (
      moduleId:
        | 'labnotebook'
        | 'cdna'
        | 'qpcr-planner'
        | 'qpcr-analysis'
        | 'elisa-analysis'
        | 'animal-pairing'
        | 'breeding'
        | 'ymaze'
    ) => Promise<void>
    getSuiteInfo?: () => Promise<{ name: string; version: string; platform: string; isPackaged?: boolean }>
    selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>
    ensureDirectories: (paths: Record<string, string>) => Promise<{ ok: boolean; message?: string }>
    getAppInfo: () => Promise<{ name: string; version: string; platform: string }>
    getDefaultPaths: () => Promise<Record<string, string>>
  }
}
