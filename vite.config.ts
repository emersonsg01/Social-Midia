import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

// `--mode web` builds only the web bundle (used by Capacitor for Android/iOS).
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    mode !== 'web' &&
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
          },
        },
        preload: {
          input: 'electron/preload.ts',
          // Sandboxed preloads must be CommonJS.
          vite: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
        },
      }),
  ],
}))
