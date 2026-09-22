/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'

// https://vite.dev/config/
// Reuse the self-hosted Supabase variables from the Expo project root.
const envDir = path.resolve(__dirname, '..')
const envPrefix = ['VITE_', 'EXPO_PUBLIC_']

export default defineConfig(({ mode }) => {
  const supabaseUrl = loadEnv(mode, envDir, envPrefix).EXPO_PUBLIC_SUPABASE_URL

  return {
    envDir,
    envPrefix,
    server: {
      // The hosted workspace proxies dev servers through a generated
      // `*.coder.dootask.com` hostname.
      allowedHosts: ['.coder.dootask.com', 'localhost', '127.0.0.1'],
      // Supabase sits behind the Coder port proxy, which drops the CORS headers
      // the browser needs, so the console reaches it through this same-origin hop.
      proxy: supabaseUrl
        ? {
            '/sb/': {
              target: supabaseUrl,
              changeOrigin: true,
              rewrite: (requestPath: string) => requestPath.replace(/^\/sb/, ''),
            },
          }
        : undefined,
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      silent: 'passed-only',
      unstubEnvs: true,
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
      coverage: {
        // include: ['src/**/*.{js,jsx,ts,tsx}'], // Uncomment to expand the report to all src/**/* so untested modules appear as 0% coverage.
        exclude: [
          'src/components/ui/**',
          'src/assets/**',
          'src/tanstack-table.d.ts',
          'src/routeTree.gen.ts',
          'src/test-utils/**',
          'src/routes/**',
        ],
      },
    },
  }
})
