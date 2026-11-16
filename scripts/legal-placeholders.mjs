// Garde des Mentions légales (R11, relecture juridique) : dit, avant un déploiement, si les pages
// légales ont encore un emplacement à remplir, et refuse le déploiement d'un site ouvert à tous.
// Tant que l'inscription demande un code d'invitation (le site est en test, entre proches), il
// avertit seulement (décision de Louis du 16/11/2026). Deux sortes de trous :
// - une coordonnée de `packages/brand/src/legal.ts` qui vaut encore `legalPlaceholder` (« […] ») ;
// - un crochet resté dans un texte des pages légales (`legal.pages` de fr.ts et en.ts), comme
//   « [durée de la copie de l'hébergeur] ». Un lien Markdown, `[texte](adresse)`, n'en est pas un.
// La loi (LCEN, art. 6) demande ces mentions : un site ne doit pas les montrer à moitié remplies.
//
// Usage : node scripts/legal-placeholders.mjs [<commit>]   (sans commit : la copie de travail)
// Sortie 0 : rien à remplir, ou des trous sur un site encore sur invitation (avertissement) ;
// sortie 1 : des trous sur un site ouvert. infra/deploy-from-pc.sh l'appelle.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BRAND = 'packages/brand/src/legal.ts'
const ENV = 'apps/api/src/env.ts'

/**
 * L'inscription demande-t-elle un code en production ? C'est `env.ts` qui le décide : sans
 * `SIGNUP_INVITE_CODE`, le serveur de production refuse de démarrer. Ouvrir le site à tous, ce
 * sera retirer cette exigence ; le garde redevient alors bloquant de lui-même.
 */
export const inviteRequired = (envSource) =>
  /path: \['SIGNUP_INVITE_CODE'\],\s*message: `required in production/.test(envSource)
const LOCALES = { fr: 'packages/i18n/src/locales/fr.ts', en: 'packages/i18n/src/locales/en.ts' }

/**
 * Les trous, en phrases lisibles. `brandSource` : le texte de legal.ts ; `locales` : les objets de
 * textes par langue ({ fr, en }), dont seule la partie `legal.pages` est lue.
 */
export const legalHoles = ({ brandSource, locales }) => {
  const holes = []
  // Une ligne « clé: legalPlaceholder, » : la valeur n'a pas encore été tapée.
  for (const match of brandSource.matchAll(/^\s*([A-Za-z]+):\s*legalPlaceholder,?\s*$/gm)) {
    holes.push(`${BRAND} : ${match[1]}`)
  }
  // Un crochet qui n'ouvre pas un lien Markdown (pas de « ( » juste après le « ] »).
  const bracket = /\[[^\]\n]{1,120}\](?!\()/g
  for (const [language, texts] of Object.entries(locales)) {
    const visit = (value, path) => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(bracket))
          holes.push(`${language}, ${path} : ${match[0]}`)
      } else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) visit(inner, `${path}.${key}`)
      }
    }
    visit(texts?.legal?.pages, 'legal.pages')
  }
  return holes
}

/** Le texte d'un fichier, au commit donné, ou dans la copie de travail. */
const read = (path, commit) =>
  commit
    ? execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8' })
    : readFileSync(path, 'utf8')

const main = async () => {
  const commit = process.argv[2]
  // fr.ts et en.ts n'importent rien : Node les lit tels quels (il retire seul les types). On les
  // copie dans un dossier temporaire pour lire ceux du commit demandé, pas ceux de la copie.
  const dir = mkdtempSync(join(tmpdir(), 'legal-holes-'))
  try {
    const locales = {}
    for (const [language, path] of Object.entries(LOCALES)) {
      const file = join(dir, `${language}.ts`)
      writeFileSync(file, read(path, commit))
      locales[language] = (await import(pathToFileURL(file).href))[language]
    }
    const holes = legalHoles({ brandSource: read(BRAND, commit), locales })
    if (holes.length === 0) {
      console.log('Mentions légales : rien à remplir.')
      return
    }
    console.error(`Mentions légales : ${holes.length} emplacement(s) à remplir :`)
    for (const hole of holes) console.error(`  - ${hole}`)
    if (inviteRequired(read(ENV, commit))) {
      console.error('Site sur invitation : déploiement permis, à remplir avant l’ouverture.')
      return
    }
    console.error('Site ouvert à tous : déploiement refusé tant que ces mentions manquent.')
    process.exitCode = 1
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
