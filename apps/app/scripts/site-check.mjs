// Visite un site déjà en ligne (la pile d'essai de la CI, ou waiggle.com) dans un vrai navigateur,
// comme un visiteur sans compte, sur téléphone et ordinateur, de jour et de nuit. Signale :
// - tout ce que la CSP du serveur a bloqué (un script, un style, une image ou un appel refusé :
//   en production, l'appli serait cassée sans qu'aucun test de l'appli ne le voie) ;
// - toute erreur dans la page, dont un écart entre la page pré-rendue et le navigateur.
//
// Usage : node apps/app/scripts/site-check.mjs <adresse du site>
//   node apps/app/scripts/site-check.mjs https://waiggle.com
// La pile d'essai (infra/stack-test.sh) le lance sur https://localhost.
import { chromium } from 'playwright'

const base = process.argv[2]
if (!base?.startsWith('http')) {
  console.error('Usage : node apps/app/scripts/site-check.mjs <adresse du site>')
  process.exit(2)
}

const paths = [
  '/',
  '/sign-in',
  '/sign-up',
  '/check-email?email=lea%40example.com',
  '/out?url=https%3A%2F%2Fexample.com',
  '/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6',
  '/members/AbC123_xyz-9',
  '/tags/claude-code',
  '/nope',
]

const problems = []
const browser = await chromium.launch()
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const colorScheme of ['light', 'dark']) {
    // ignoreHTTPSErrors : la pile d'essai utilise les certificats locaux de Caddy.
    const context = await browser.newContext({ viewport, colorScheme, ignoreHTTPSErrors: true })
    // Le navigateur annonce chaque blocage de la CSP par un évènement : on le fait remonter.
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        console.error(
          `CSP a bloqué ${event.blockedURI || 'un contenu en ligne'} (${event.violatedDirective})`,
        )
      })
    })
    const page = await context.newPage()
    const where = () => `${new URL(page.url()).pathname} (${viewport.width} px, ${colorScheme})`
    page.on('console', (message) => {
      if (message.type() === 'error' && /CSP|Content Security Policy/.test(message.text())) {
        problems.push(`${where()} : ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => problems.push(`${where()} : ${error.message}`))
    for (const path of paths) {
      await page.goto(base + path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(800) // le temps de l'hydratation et des animations
    }
    await context.close()
  }
}
await browser.close()

if (problems.length > 0) {
  console.error(`Problèmes dans le navigateur :\n- ${[...new Set(problems)].join('\n- ')}`)
  process.exit(1)
}
console.log(`ok : ${paths.length} pages, 4 affichages, ni blocage de la CSP ni erreur dans la page`)
