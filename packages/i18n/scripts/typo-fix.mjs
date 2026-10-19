// Pose la typographie française dans les textes de src/locales/fr.ts : espaces insécables avant
// ? ! ; :, à l'intérieur de « », et apostrophe typographique. Les règles sont dans
// typography-fix.ts ; le test src/typography.test.ts reste le garde-fou.
//
// Usage : pnpm --filter @ruche/i18n typo:fix                  (corrige src/locales/fr.ts)
//         pnpm --filter @ruche/i18n typo:fix -- autre/fichier.ts (corrige un autre fichier)
// Relancé une seconde fois, il ne change plus rien. Node lit directement le fichier TypeScript.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixSource } from './typography-fix.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// « -- » vient de « pnpm … typo:fix -- fichier » ; un chemin relatif se lit depuis l'endroit où la
// commande a été tapée (pnpm le garde dans INIT_CWD).
const target = process.argv.slice(2).find((arg) => arg !== '--')
const file = target
  ? resolve(process.env.INIT_CWD ?? process.cwd(), target)
  : join(root, 'src', 'locales', 'fr.ts')

const before = readFileSync(file, 'utf8')
const { source, count, lines } = fixSource(before)
// Le chemin affiché : court s'il est dans le paquet, complet sinon.
const name = relative(root, file).startsWith('..') ? file : relative(root, file)
if (count === 0) {
  console.log(`typo:fix : aucune correction dans ${name}.`)
} else {
  writeFileSync(file, source)
  const where = lines.length === 1 ? 'ligne' : 'lignes'
  console.log(
    `typo:fix : ${count} correction${count > 1 ? 's' : ''} dans ${name} (${where} ${lines.join(', ')}).`,
  )
}
