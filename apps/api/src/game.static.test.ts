// Tests statiques de la tranche R19 (la gamification) : ils lisent le code de l'API et les textes,
// sans lancer l'API.
// - Le grand livre du pollen ne s'écrit qu'à un endroit, `game/award.ts` (plan, choix 2 : « jamais
//   d'écriture de `pollen_entry` ailleurs ») : le pollen d'un geste, celui d'un défi réussi, la
//   révocation par la modération (`revokeFor`, relecture de sécurité S5) et ce que la purge de nuit
//   efface (`counterpart_id`, relecture juridique J3) passent tous par ses fonctions. Un plafond, un
//   verrou ou un compte d'exemple oubliés ailleurs ne peuvent donc pas exister.
// - L'en-tête `Waiggle-Pollen` ne se pose qu'à un endroit, `setPollen` de `game/award.ts` (le
//   découpage du plan) : chaque route de geste dit ce qu'elle a rapporté de la même façon.
// - Aucun code sans texte : chaque défi, sceau, famille, décoration et erreur du contrat
//   (packages/contracts/src/game.ts) a son texte en français et en anglais. Ces tests-là passent
//   dès l'écriture (contrat et textes commités ensemble) : ils gardent la règle pour un code ajouté.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DECORATIONS,
  FAMILIES,
  HIVE_CHALLENGES,
  MILESTONE_SEALS,
  PERSONAL_CHALLENGES,
  SEALS,
  sealCategory,
} from '@ruche/contracts'
import { resources } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))
const AWARD = 'game/award.ts'

/** Les fichiers de l'API, hors tests et outils de test, en chemins depuis src/. */
const sources = () =>
  (readdirSync(root, { recursive: true, encoding: 'utf8' }) as string[])
    .map((file) => file.split(sep).join(posix.sep))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .filter((file) => !file.startsWith('testing/'))

/**
 * Le code seul, sans ses commentaires : un commentaire qui parle de la table ne l'écrit pas
 * (pieges/api-tests.md). On retire les blocs « /* … *\/ » et les fins de ligne « // … » (pas
 * « https:// » : un « // » précédé de « : » est une adresse).
 */
const codeOf = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Ce code écrit-il dans le grand livre ? Par Drizzle (`insert(schema.pollenEntry)`, `.update(…)`,
 * `.delete(…)`, aussi sous un autre nom : `const ledger = schema.pollenEntry`), ou en SQL brut
 * (`insert into pollen_entry`, `update pollen_entry`, `delete from pollen_entry`).
 */
const writesLedger = (code: string) => {
  const aliases = [...code.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*schema\.pollenEntry\b/g)].map(
    (match) => match[1] ?? '',
  )
  const names = ['schema\\.pollenEntry', 'pollenEntry', ...aliases].join('|')
  const drizzle = new RegExp(String.raw`\.(?:insert|update|delete)\(\s*(?:${names})\b`)
  const raw = /\b(?:insert\s+into|update|delete\s+from)\s+"?pollen_entry"?\b/i
  return drizzle.test(code) || raw.test(code)
}

/** Ce code pose-t-il l'en-tête du pollen sur une réponse ? */
const setsPollenHeader = (code: string) =>
  /\.header\(\s*(?:POLLEN_HEADER|['"`]Waiggle-Pollen['"`])/i.test(code)

describe('the single writer of the pollen ledger', () => {
  it('tells a write of the ledger from a read', () => {
    // Le détecteur lui-même, sur des exemples : sans ce témoin, une expression fautive ne
    // trouverait jamais rien, et le test suivant passerait toujours.
    expect(writesLedger('await tx.insert(schema.pollenEntry).values(entry)')).toBe(true)
    expect(writesLedger('const ledger = schema.pollenEntry\nawait tx.update(ledger).set({})')).toBe(
      true,
    )
    expect(writesLedger('await db.delete(schema.pollenEntry).where(x)')).toBe(true)
    expect(writesLedger('sql`update pollen_entry set revoked_at = now()`')).toBe(true)
    expect(writesLedger('sql`insert into "pollen_entry" (member_id) values (1)`')).toBe(true)
    expect(writesLedger('await db.select().from(schema.pollenEntry)')).toBe(false)
    expect(writesLedger(codeOf('// on fait un insert(schema.pollenEntry) dans award.ts'))).toBe(
      false,
    )
  })

  it('writes the pollen ledger in game/award.ts only', () => {
    const files = sources()
    const writers = files.filter((file) =>
      writesLedger(codeOf(readFileSync(join(root, file), 'utf8'))),
    )

    // Témoin : award.ts existe et écrit bien le grand livre (le détecteur le reconnaît).
    expect(files).toContain(AWARD)
    expect(writers).toContain(AWARD)
    expect(writers.filter((file) => file !== AWARD)).toEqual([])
  })

  it('sets the pollen header through setPollen of game/award.ts only', () => {
    const files = sources()
    const setters = files.filter((file) =>
      setsPollenHeader(codeOf(readFileSync(join(root, file), 'utf8'))),
    )
    expect(setters).toEqual([AWARD])
    const award = codeOf(readFileSync(join(root, AWARD), 'utf8'))
    expect(award).toMatch(/export\s+(?:const|function)\s+setPollen\b/)
    expect(award).toMatch(/export\s+(?:const|(?:async\s+)?function)\s+award\b/)
    expect(award).toMatch(/export\s+(?:const|(?:async\s+)?function)\s+revokeFor\b/)
    // Le détecteur, sur des exemples.
    expect(setsPollenHeader('c.header(POLLEN_HEADER, String(amount))')).toBe(true)
    expect(setsPollenHeader("c.header('Waiggle-Pollen', '2')")).toBe(true)
    expect(setsPollenHeader("c.header('Retry-After', '60')")).toBe(false)
  })
})

// --- Aucun code sans texte ---

type Language = keyof typeof resources

/** Le texte à ce chemin (`['game', 'seals', 'first_project']`), ou undefined s'il manque. */
const textAt = (language: Language, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object'
        ? (node as Record<string, unknown>)[key]
        : undefined,
    resources[language].translation,
  )

/** Les chemins dont le texte manque, ou est vide, dans l'une des deux langues. */
const missingTexts = (paths: readonly (readonly string[])[]) =>
  (['fr', 'en'] as const).flatMap((language) =>
    paths
      .filter((path) => {
        const text = textAt(language, path)
        return typeof text !== 'string' || text.trim() === ''
      })
      .map((path) => `${language}: ${path.join('.')}`),
  )

describe('a text for every code of the game', () => {
  it('names every personal and hive challenge', () => {
    const paths = [
      ...PERSONAL_CHALLENGES.map(({ code }) => ['game', 'challenges', 'personal', code]),
      ...HIVE_CHALLENGES.map(({ code }) => ['game', 'challenges', 'hive', code]),
    ]

    expect(paths).toHaveLength(10)
    expect(missingTexts(paths)).toEqual([])
  })

  it('names every seal, milestones and categories', () => {
    const paths = SEALS.map(({ code }) => {
      const category = sealCategory(code)
      return category === null ? ['game', 'seals', code] : ['game', 'seals', 'category', category]
    })

    expect(paths.length).toBe(SEALS.length)
    expect(paths.filter((path) => path[2] !== 'category')).toHaveLength(MILESTONE_SEALS.length)
    expect(missingTexts(paths)).toEqual([])
    // Une catégorie créée plus tard a le texte commun, avec le nom de la catégorie.
    expect(missingTexts([['game', 'seals', 'categoryOther']])).toEqual([])
  })

  it('names every family, as a title in both forms and by its gestures', () => {
    const paths = FAMILIES.flatMap((family) => [
      ['game', 'titles', `${family}_f`],
      ['game', 'titles', `${family}_m`],
      ['game', 'families', family],
    ])

    expect(missingTexts(paths)).toEqual([])
  })

  it('names every tint and pattern of the decoration', () => {
    const paths = [
      ...Object.keys(DECORATIONS.tint).map((tint) => ['game', 'decoration', 'tints', tint]),
      ...Object.keys(DECORATIONS.pattern).map((pattern) => [
        'game',
        'decoration',
        'patterns',
        pattern,
      ]),
    ]

    expect(paths).toHaveLength(7)
    expect(missingTexts(paths)).toEqual([])
  })

  it('translates every error of the game', () => {
    // Les codes de l'API et leur clé de texte (apps/api/src/errors.ts relie les deux).
    const paths = [
      'honeyShort',
      'honeyAlready',
      'rankingsOff',
      'invalidChallenge',
      'invalidLevelSeen',
      'familyNotObtained',
    ].map((key) => ['errors', key])

    expect(missingTexts(paths)).toEqual([])
  })
})
