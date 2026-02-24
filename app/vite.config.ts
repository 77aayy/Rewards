import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname)
const rewardsRoot = path.join(appRoot, 'Rewards')
const appSharedRoot = path.join(appRoot, 'shared')

// في التطوير: خدمة /rewards/* من مصدر Rewards مباشرة حتى يظهر أي تعديل فوراً بدون تشغيل sync:rewards
function serveRewardsFromSource(req: any, res: any, next: () => void) {
  const url = req.url || ''
  if (!url.startsWith('/rewards')) return next()
  const pathname = url.split('?')[0]
  if (pathname === '/rewards' || pathname === '/rewards/') {
    return next() // يمر للمiddleware اللي يحوّلها لـ index.html
  }
  let filePath: string
  if (pathname === '/rewards/index.html') {
    filePath = path.join(rewardsRoot, 'index.html')
  } else if (pathname.startsWith('/rewards/src/')) {
    const sub = pathname.slice('/rewards/src/'.length)
    filePath = path.join(rewardsRoot, 'src', sub)
  } else if (pathname.startsWith('/rewards/shared/')) {
    const sub = pathname.slice('/rewards/shared/'.length)
    filePath = path.join(appSharedRoot, sub)
  } else if (pathname.startsWith('/rewards/')) {
    const sub = pathname.slice('/rewards/'.length)
    filePath = path.join(rewardsRoot, sub)
  } else {
    return next()
  }
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return next()
    const ext = path.extname(filePath)
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml',
      '.webmanifest': 'application/manifest+json',
    }
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
    // منع الكاش في التطوير حتى يظهر أي تعديل فوراً عند التحديث
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.end(fs.readFileSync(filePath))
  } catch {
    next()
  }
}

export default defineConfig({
  build: {
    reportCompressedSize: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          if (id.includes('node_modules/xlsx')) return 'xlsx';
          if (id.includes('node_modules/@tanstack/react-table')) return 'react-table';
        },
      },
    },
  },
  server: {
    port: 5180,
    strictPort: true, // منفذ ثابت لهذا المشروع (5180)؛ 5173 و 5175 قد تكون لمشاريع أخرى
  },
  plugins: [
    react(),
    tailwindcss(),
    // نسخ app/shared إلى dist/shared عند البناء حتى /shared/conditions-content.json يعمل في الإنتاج
    {
      name: 'copy-shared-to-dist',
      closeBundle() {
        const outDir = path.join(appRoot, 'dist')
        const sharedDest = path.join(outDir, 'shared')
        if (!fs.existsSync(appSharedRoot)) return
        if (!fs.existsSync(sharedDest)) fs.mkdirSync(sharedDest, { recursive: true })
        fs.readdirSync(appSharedRoot).forEach((name) => {
          const src = path.join(appSharedRoot, name)
          const dest = path.join(sharedDest, name)
          if (fs.statSync(src).isFile()) fs.copyFileSync(src, dest)
        })
      },
    },
    // خدمة /rewards و /rewards/ كصفحة المكافآت (من public/rewards)
    // + توجيه روابط الأدوار (supervisor/hr/accounting/manager/e) لصفحة المكافآت
    {
      name: 'rewards-index',
      configureServer(server) {
        // 1) إعادة كتابة /rewards و /rewards/ إلى index.html
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
        // 2) تقديم ملفات /rewards من مجلد Rewards (المصدر) حتى يظهر التعديل فوراً بدون sync
        server.middlewares.use(serveRewardsFromSource)
        // 3) تقديم /shared/* من app/shared (مصدر واحد لـ conditions-content.json وغيره) لصفحة التحليل والتطبيق الرئيسي
        server.middlewares.use((req, res, next) => {
          const url = req.url || ''
          const pathname = url.split('?')[0]
          if (!pathname.startsWith('/shared/')) return next()
          const sub = pathname.slice('/shared/'.length)
          const filePath = path.join(appSharedRoot, sub)
          try {
            const stat = fs.statSync(filePath)
            if (!stat.isFile()) return next()
            const ext = path.extname(filePath)
            const types: Record<string, string> = {
              '.json': 'application/json; charset=utf-8',
              '.js': 'application/javascript; charset=utf-8',
            }
            res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
            res.end(fs.readFileSync(filePath))
          } catch {
            next()
          }
        })
      },
    },
  ],
})
