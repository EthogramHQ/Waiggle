// Vérifie que le Caddyfile convient à l'appli web construite, avant de la mettre en ligne.
// Lancé à chaque construction de l'image « web » (infra/web/Dockerfile) et par la CI.
//
// Des oublis possibles, qu'aucun test de l'appli ne verrait :
// 1. Un script écrit directement dans une page (« en ligne ») que la CSP n'autorise pas : en
//    production, le navigateur refuserait de l'exécuter et l'appli ne démarrerait pas.
// 2. Une page à paramètre (projects/[id].html) sans règle de réécriture : son adresse
//    (/projects/0192abcd) afficherait « introuvable ».
// 3. Un outil de développement servi en ligne.
// 4. Une page publique sans sa copie française ou anglaise, la copie générique [lang]/ servie, ou
//    le marqueur de la tête absent (R12).
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

// R12 : la copie générique des pages par langue (app/[lang]/…), que le serveur ne sert jamais
// (règle 4) : elle n'a pas de règle de réécriture.
const GENERIC = '[lang]/'
const isGeneric = (page) => page.startsWith(GENERIC)

// 2. Les pages à paramètre : leur nom contient des crochets. Le Caddyfile doit réécrire une
//    adresse vers chacune d'elles (« rewrite @… /projects/[id].html »).
for (const page of pages.filter((p) => p.includes('[') && !isGeneric(p))) {
  const rule = new RegExp(
    `^\\s*rewrite\\s+@\\S+\\s+/${page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'm',
  )
  if (!rule.test(caddyfile)) {
    problems.push(`${page} : aucune règle « rewrite » dans infra/Caddyfile ne mène à cette page.`)
  }
}

// 3. Les pages d'outil de développement (audit de sécurité du 7/11/2026) : le plan du site
//    d'Expo Router et le catalogue des composants sont construits avec l'appli, mais n'ont rien à
//    faire en ligne. Le Caddyfile doit répondre « introuvable » à leur adresse, avec ou sans
//    « .html » : la règle « @devtools path … » suivie de « error @devtools 404 ».
const DEV_TOOLS = ['_sitemap', 'catalogue']
const devtools =
  caddyfile
    .match(/^\s*@devtools\s+path\s+(.+)$/m)?.[1]
    ?.trim()
    .split(/\s+/) ?? []
const closed = new Set(/^\s*error\s+@devtools\s+404\s*$/m.test(caddyfile) ? devtools : [])
for (const tool of DEV_TOOLS.filter((name) => pages.includes(`${name}.html`))) {
  for (const path of [`/${tool}`, `/${tool}.html`]) {
    if (!closed.has(path)) {
      problems.push(`${path} : outil de développement servi en ligne ; l'ajouter à @devtools.`)
    }
  }
}

// 4. Les pages par langue (R12, plan, décision 8 de la relecture). Expo Router prépare chaque page
//    de app/[lang]/ en français (fr/…) et en anglais (en/…), plus une copie générique ([lang]/…).
//    a. Chaque page générique a ses deux copies : sinon, une langue afficherait « introuvable ».
//    b. La copie générique n'est jamais servie : la règle « @generic_lang » du Caddyfile, suivie
//       de « error @generic_lang 404 », et aucune réécriture qui y mène.
//    c. Chaque page fr/ et en/ porte le marqueur de la tête (apps/app/app/+html.tsx), écrit avec
//       les délimiteurs que le Caddyfile déclare (« between [[waiggle ]] ») : sinon, Caddy n'y
//       écrirait ni titre, ni aperçu des liens, ni « noindex ».
const LANGUAGES = ['fr', 'en']
const generic = pages.filter(isGeneric)
for (const lang of LANGUAGES) {
  if (!pages.includes(`${lang}/index.html`)) {
    problems.push(`${lang}/index.html manque : l'accueil n'est pas préparé dans cette langue.`)
  }
  for (const page of generic) {
    const copy = `${lang}/${page.slice(GENERIC.length)}`
    if (!pages.includes(copy)) problems.push(`${copy} manque : ${page} n'a pas sa copie ${lang}.`)
  }
}
const genericClosed =
  /^\s*@generic_lang\s+path_regexp\s+\^\/\\\[lang\\\]\(\/\|\$\)\s*$/m.test(caddyfile) &&
  /^\s*error\s+@generic_lang\s+404\s*$/m.test(caddyfile)
if (!genericClosed) {
  problems.push(
    `la copie générique ${GENERIC} n'est pas fermée : il faut « @generic_lang path_regexp ^/\\[lang\\](/|$) » et « error @generic_lang 404 » dans infra/Caddyfile.`,
  )
}
if (/^\s*rewrite\s+\S+\s+\/\[lang\]/m.test(caddyfile)) {
  problems.push('une règle « rewrite » du Caddyfile mène à la copie générique [lang]/ : à retirer.')
}
const [open, close] = caddyfile.match(/^\s*between\s+(\S+)\s+(\S+)\s*$/m)?.slice(1) ?? []
if (open !== '[[waiggle' || close !== ']]') {
  problems.push('infra/Caddyfile : les gabarits doivent déclarer « between [[waiggle ]] ».')
}
for (const page of pages.filter((p) => LANGUAGES.some((lang) => p.startsWith(`${lang}/`)))) {
  if (!readFileSync(join(dist, page), 'utf8').includes(`${open ?? '[[waiggle'} httpInclude`)) {
    problems.push(`${page} : sans le marqueur de la tête (apps/app/app/+html.tsx).`)
  }
}

if (problems.length > 0) {
  console.error(
    `L'appli construite et infra/Caddyfile ne vont pas ensemble :\n- ${problems.join('\n- ')}`,
  )
  process.exit(1)
}
console.log(
  `Caddyfile vérifié : ${pages.length} pages, scripts en ligne autorisés, pages à paramètre réécrites, pages par langue complètes et marquées, copie générique fermée.`,
)
