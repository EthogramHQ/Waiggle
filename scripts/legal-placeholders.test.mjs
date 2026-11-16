// Tests du garde des Mentions légales (scripts/legal-placeholders.mjs), lancés par `node --test` :
// `pnpm test:scripts`, `pnpm check` et la CI. Les textes sont écrits ici : aucun appel à Git.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { inviteRequired, legalHoles } from './legal-placeholders.mjs'

// Tant que l'inscription demande un code (site en test), les trous n'empêchent pas le déploiement
// (décision du 16/11/2026) ; le garde le lit dans env.ts.
describe('inviteRequired', () => {
  it('sees the invitation code required in production by the real env.ts', () => {
    assert.equal(inviteRequired(readFileSync('apps/api/src/env.ts', 'utf8')), true)
  })

  it('sees an open site once the requirement is gone', () => {
    assert.equal(inviteRequired('SIGNUP_INVITE_CODE: optional(z.string())'), false)
  })
})

/** Un `legal.ts` minimal : chaque valeur inconnue vaut `legalPlaceholder`. */
const brand = (fields) =>
  `export const legal = {\n${fields.map(([key, value]) => `  ${key}: ${value},`).join('\n')}\n} as const\n`

/** Les pages légales d'une langue, telles que les lit l'appli (`legal.pages`). */
const locale = (body) => ({ legal: { pages: { legal: { sections: { publisher: { body } } } } } })

describe('legalHoles', () => {
  it('finds nothing once every field and every text is filled', () => {
    const holes = legalHoles({
      brandSource: brand([
        ['name', "'Louis'"],
        ['email', 'contactEmail'],
      ]),
      locales: { fr: locale('Éditeur : {{publisher}}. Voir [la CNIL](https://www.cnil.fr).') },
    })
    assert.deepEqual(holes, [])
  })

  it('names each coordinate still marked in legal.ts', () => {
    const holes = legalHoles({
      brandSource: brand([
        ['name', 'legalPlaceholder'],
        ['phone', 'legalPlaceholder'],
        ['email', 'contactEmail'],
      ]),
      locales: {},
    })
    assert.deepEqual(holes, [
      'packages/brand/src/legal.ts : name',
      'packages/brand/src/legal.ts : phone',
    ])
  })

  it('names a bracket left in a legal page, but not a Markdown link', () => {
    const holes = legalHoles({
      brandSource: brand([]),
      locales: {
        fr: locale('- **La copie** : [durée de la copie]\n- [cnil.fr](https://www.cnil.fr)'),
        en: locale('- **The copy**: [duration of the copy]'),
      },
    })
    assert.deepEqual(holes, [
      'fr, legal.pages.legal.sections.publisher.body : [durée de la copie]',
      'en, legal.pages.legal.sections.publisher.body : [duration of the copy]',
    ])
  })
})
