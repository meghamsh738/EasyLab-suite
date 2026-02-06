import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_DIR = process.env.APP_DIST_DIR ?? path.join(ROOT_DIR, '.suite-dist', 'web')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: DIST_DIR,
    emptyOutDir: true,
    // On WSL + /mnt/<drive> (drvfs), Node's fs.copyFile can fail with EPERM during
    // public dir copying. We copy required public assets in the npm build script instead.
    copyPublicDir: false,
  },
})
