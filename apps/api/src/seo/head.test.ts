// Tests de la tête des pages publiques (seo/head.ts) : ce que les tests de la route
// (public-head.test.ts) ne couvrent pas. La langue du chemin l'emporte sur le paramètre `lang`
// (décision du 16/11/2026, plan R12), et l'échappement ne laisse aucun caractère que le gabarit de
// Caddy pourrait lire (relecture de sécurité B1).
import { appName } from '@ruche/brand'
import { fill, resources } from '@ruche/i18n'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, TEST_API_URL, TEST_APP_URL, type TestContext } from '../testing/context'
import { escapeHead, headFor, neutralHead } from './head'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

const head = (path: string | null, lang: 'fr' | 'en') =>
  headFor(ctx.db, { path, lang, appUrl: TEST_APP_URL, apiUrl: TEST_API_URL })

describe('the language of a head (decision of 16/11/2026)', () => {
  it('follows the language of the path, whatever the lang parameter says', async () => {
    const english = await head('/en/rules', 'fr')
    const french = await head('/fr/rules', 'en')
    expect(english).toContain(`<title>${fill(resources.en.translation.legal.pages.rules.title)}`)
    expect(english).toContain(`<link rel="canonical" href="${TEST_APP_URL}/en/rules">`)
    expect(english).toContain('content="en_US"')
    expect(french).toContain(`<title>${fill(resources.fr.translation.legal.pages.rules.title)}`)
    expect(french).toContain(`<link rel="canonical" href="${TEST_APP_URL}/fr/rules">`)
    // Témoin : sans désaccord, la même tête.
    expect(await head('/en/rules', 'en')).toBe(english)
  })

  it('gives the neutral head of the language of the path, and of lang only for a path without one', async () => {
    expect(await head('/en/nowhere', 'fr')).toBe(neutralHead('en'))
    expect(await head('/fr/nowhere', 'en')).toBe(neutralHead('fr'))
    expect(await head('/feed', 'en')).toBe(neutralHead('en'))
    expect(await head(null, 'en')).toBe(neutralHead('en'))
    // Témoin : les deux têtes neutres diffèrent (la phrase d'accueil de chaque langue), mais
    // portent toutes deux le seul nom de l'appli et `noindex`.
    expect(neutralHead('en')).not.toBe(neutralHead('fr'))
    for (const lang of ['fr', 'en'] as const) {
      expect(neutralHead(lang)).toContain(`<title>${appName}</title>`)
      expect(neutralHead(lang)).toContain('<meta name="robots" content="noindex">')
    }
  })
})

describe('escapeHead (security review B1)', () => {
  it('turns every character that HTML or the Caddy template reads into an entity', () => {
    const escaped = escapeHead('[[waiggle `x`]] <b>"a" & \'b\'</b>')
    expect(escaped).not.toMatch(/[[\]<>"'`]/)
    expect(escaped).toBe(
      '&#91;&#91;waiggle &#96;x&#96;&#93;&#93; &lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;',
    )
  })
})
