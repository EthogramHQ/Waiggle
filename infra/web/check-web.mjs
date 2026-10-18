// Vérifie que le Caddyfile convient à l'appli web construite, avant de la mettre en ligne.
// Lancé à chaque construction de l'image « web » (infra/web/Dockerfile) et par la CI.
//
// Deux oublis possibles, qu'aucun test de l'appli ne verrait :
// 1. Un script écrit directement dans une page (« en ligne ») que la CSP n'autorise pas : en
//    production, le navigateur refuserait de l'exécuter et l'appli ne démarrerait pas.
// 2. Une page à paramètre (projects/[id].html) sans règle de réécriture : son adresse
//    (/projects/0192abcd) afficherait « introuvable ».
//
// Usage : node infra/web/check-web.mjs <dossier de l'appli construite> <Caddyfile>
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const [dist, caddyfilePath] = process.argv.slice(2)
if (!dist || !caddyfilePath) {
  console.error('Usage : node infra/web/check-web.mjs <dist> <Caddyfile>')
  process.exit(2)
}
const caddyfile = readFileSync(caddyfilePath, 'utf8')
const problems = []

// Toutes les pages HTML construites, avec leur chemin relatif écrit avec des « / ».
const pagesIn = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return pagesIn(path)
    return entry.name.endsWith('.html') ? [relative(dist, path).split(sep).join('/')] : []
  })
const pages = pagesIn(dist)
if (!pages.includes('index.html') || !pages.includes('+not-found.html')) {
  problems.push(`${dist} ne contient pas index.html et +not-found.html : est-ce bien l'appli ?`)
}

// 1. Les scripts en ligne. Une empreinte (sha256) identifie un texte exact : la CSP liste les
//    empreintes des scripts autorisés, on calcule celle de chaque script trouvé dans les pages.
const scriptSrc = caddyfile.match(/script-src([^;"]*)/)?.[1] ?? ''
const allowed = new Set(scriptSrc.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [])
// Un <script> sans attribut src, et son contenu.
const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
// Les scripts refusés, regroupés par empreinte : le même script se répète souvent sur chaque page.
const refused = new Map()
for (const page of pages) {
  const html = readFileSync(join(dist, page), 'utf8')
  for (const [, code] of html.matchAll(inlineScript)) {
    if (code.trim() === '') continue
    const hash = `'sha256-${createHash('sha256').update(code).digest('base64')}'`
    if (!allowed.has(hash)) {
      const seen = refused.get(hash) ?? { code, pages: [] }
      seen.pages.push(page)
      refused.set(hash, seen)
    }
  }
}
for (const [hash, { code, pages: where }] of refused) {
  problems.push(
    `script en ligne non autorisé par la CSP, dans ${where.length} page(s) (${where[0]}…) : « ${code.slice(0, 80)} ». S'il est voulu, ajouter ${hash} à script-src dans infra/Caddyfile.`,
  )
}

// 2. Les pages à paramètre : leur nom contient des crochets. Le Caddyfile doit réécrire une
//    adresse vers chacune d'elles (« rewrite @… /projects/[id].html »).
for (const page of pages.filter((p) => p.includes('['))) {
  const rule = new RegExp(
    `^\\s*rewrite\\s+@\\S+\\s+/${page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'm',
  )
  if (!rule.test(caddyfile)) {
    problems.push(`${page} : aucune règle « rewrite » dans infra/Caddyfile ne mène à cette page.`)
  }
}

if (problems.length > 0) {
  console.error(
    `L'appli construite et infra/Caddyfile ne vont pas ensemble :\n- ${problems.join('\n- ')}`,
  )
  process.exit(1)
}
console.log(
  `Caddyfile vérifié : ${pages.length} pages, scripts en ligne autorisés, pages à paramètre réécrites.`,
)
