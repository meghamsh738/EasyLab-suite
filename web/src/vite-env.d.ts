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
    openModuleInSuite?: (
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
    returnToSuite?: () => Promise<void>
    prewarmModule?: (
      moduleId:
        | 'labnotebook'
        | 'cdna'
        | 'qpcr-planner'
        | 'qpcr-analysis'
        | 'elisa-analysis'
        | 'animal-pairing'
        | 'breeding'
        | 'ymaze'
    ) => Promise<boolean>
    getSuiteInfo?: () => Promise<{ name: string; version: string; platform: string; isPackaged?: boolean }>
    setZoomFactor?: (value: number) => Promise<number>
    selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>
    ensureDirectories: (paths: Record<string, string>) => Promise<{ ok: boolean; message?: string }>
    getAppInfo: () => Promise<{ name: string; version: string; platform: string }>
    getDefaultPaths: () => Promise<Record<string, string>>
  }
}

declare namespace React.JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string
      preload?: string
      allowpopups?: string
    }
  }
}
