// Vérifie l'aperçu du serveur de développement comme le ferait un navigateur : la page s'ouvre,
// ses appels à l'API répondent, sans erreur dans la console. Se lance SUR le serveur, depuis
// apps/app d'une copie de travail (pour trouver Playwright) :
//   ruche-dev run <branche> <commit> -- node infra/vps-dev/verifie-apercu.mjs [adresse] [capture.png]
// ou directement : cd /srv/ruche-dev/branches/<b>/apps/app && node ../../infra/vps-dev/verifie-apercu.mjs
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'apps', 'app', 'package.json'))
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = createRequire(join(process.cwd(), 'package.json'))('playwright'))
}

const url = process.argv[2] ?? 'https://ruche-dev.tailb9858b.ts.net/'
const shot = process.argv[3] ?? '/tmp/apercu.png'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const calls = []
const errors = []
page.on('response', (res) => {
  const u = new URL(res.url())
  if (/^\/(v1|api\/auth|media|health)\b/.test(u.pathname)) calls.push(`${res.status()} ${u.pathname}`)
})
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text().slice(0, 200))
})
page.on('pageerror', (err) => errors.push(`exception : ${err.message.slice(0, 200)}`))
const started = Date.now()
await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
await page.waitForTimeout(Number(process.env.ATTENTE ?? 8000))
await page.screenshot({ path: shot })
const title = await page.title()
await browser.close()
const bad = calls.filter((c) => !/^(2|3)\d\d /.test(c) && !/^401 \/api\/auth\/get-session/.test(c))
console.log(`Page : « ${title} » en ${Math.round((Date.now() - started) / 1000)} s ; capture ${shot}`)
console.log(`Appels à l'API (${calls.length}) :\n  ${calls.join('\n  ') || 'aucun'}`)
if (errors.length) console.log(`Erreurs de console (${errors.length}) :\n  ${errors.slice(0, 8).join('\n  ')}`)
process.exit(bad.length || /pas pu se charger/i.test(title) ? 1 : 0)
