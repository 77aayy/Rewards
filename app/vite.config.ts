import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          if (id.includes('node_modules/xlsx')) return 'xlsx';
          if (id.includes('node_modules/@tanstack/react-table')) return 'react-table';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false, // لو 5173 مشغول يختار أول منفذ متاح (5174، 5175، …)
  },
  plugins: [
    react(),
    tailwindcss(),
    // خدمة /rewards و /rewards/ كصفحة المكافآت (من public/rewards)
    // + توجيه روابط الأدوار (supervisor/hr/accounting/manager/e) لصفحة المكافآت
    {
      name: 'rewards-index',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || ''
          // /rewards, /rewards/, /rewards/?... → rewards/index.html
          if (url === '/rewards' || url === '/rewards/' || url.startsWith('/rewards/?')) {
            req.url = '/rewards/index.html'
            return next()
          }
          // Admin role links: /supervisor/TOKEN/PERIOD → 302 redirect to /rewards/?role=...&token=...&period=...
          const roleMatch = url.match(/^\/(supervisor|hr|accounting|manager)\/([^/?]+)\/([^/?]+)/)
          if (roleMatch) {
            const q = `?role=${encodeURIComponent(roleMatch[1])}&token=${encodeURIComponent(roleMatch[2])}&period=${encodeURIComponent(roleMatch[3])}`
            res.writeHead(302, { Location: `/rewards/${q}` })
            res.end()
            return
          }
          // Employee link: /e/CODE → redirect to /rewards/?code=CODE
          const empMatch = url.match(/^\/e\/([^/?]+)/)
          if (empMatch) {
            res.writeHead(302, { Location: `/rewards/?code=${encodeURIComponent(empMatch[1])}` })
            res.end()
            return
          }
          // Query-param role/code at root: /?role=... or /?code=...
          // → redirect to /rewards/ with same query string
          if (url === '/' || url.startsWith('/?')) {
            const qs = url.indexOf('?') >= 0 ? url.substring(url.indexOf('?')) : ''
            if (/[?&](role|code)=/.test(qs)) {
              res.writeHead(302, { Location: `/rewards/${qs}` })
              res.end()
              return
            }
          }
          next()
        })
      },
    },
  ],
})
