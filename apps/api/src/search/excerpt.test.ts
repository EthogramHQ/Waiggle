// Tests unitaires de l'extrait d'une description (search/excerpt.ts, tranche R3) : le texte simple
// tiré du Markdown, et son coût. Une description est écrite par un membre : une expression
// régulière qui revient en arrière sur tout le texte à chaque « [ » coûte le carré de sa longueur,
// et ce temps de calcul bloque toute l'API, hors de portée du délai de PostgreSQL (relecture S1).
import { describe, expect, it } from 'vitest'
import { excerptOf, plainText } from './excerpt'

/** 20 extraits : le plus grand nombre de projets qu'une recherche montre (SEARCH_GROUP_MAX). */
const TWENTY = 20
/**
 * Le plafond de 20 extraits, large pour un PC chargé ou une CI lente : une version linéaire en
 * prend quelques millisecondes, l'ancienne plus d'une seconde (mesure de la relecture).
 */
const BUDGET_MS = 200

/** Le temps de 20 extraits de `text` autour de « zz », après un premier passage de chauffe. */
const timeOfTwenty = (text: string): number => {
  excerptOf(text, ['zz'])
  const start = performance.now()
  for (let i = 0; i < TWENTY; i++) excerptOf(text, ['zz'])
  return performance.now() - start
}

describe('the plain text of a description', () => {
  it('keeps the text of links and images, without their address', () => {
    expect(
      plainText('un [carnet](https://cafes.example.com) et ![une photo](https://x.example/a.png)'),
    ).toBe('un carnet et une photo')
    expect(plainText('[le site](https://cafes.example.com "Le titre")')).toBe('le site')
    expect(plainText('écrire à <mailto:ines@example.com> ou <https://cafes.example.com>')).toBe(
      'écrire à mailto:ines@example.com ou https://cafes.example.com',
    )
  })

  it('drops titles, quotes, bullets and emphasis, and joins the lines', () => {
    expect(
      plainText('# Titre\n> une citation\n- une puce\n1. un pas\n**gras** ~~barré~~ `code`'),
    ).toBe('Titre une citation une puce un pas gras barré code')
  })

  it('leaves an unclosed bracket as it is', () => {
    expect(plainText('un [crochet ouvert et (une parenthèse')).toBe(
      'un [crochet ouvert et (une parenthèse',
    )
  })
})

describe('the cost of an excerpt', () => {
  it('builds the excerpt of a 10 000-character description full of « [ » quickly', () => {
    const text = `zz ${'['.repeat(9_990)}`
    expect(excerptOf(text, ['zz'])?.startsWith('zz')).toBe(true)
    expect(timeOfTwenty(text)).toBeLessThan(BUDGET_MS)
  })

  it('builds the excerpt of a 10 000-character description full of « ![ » quickly', () => {
    expect(timeOfTwenty(`zz ${'!['.repeat(4_995)}`)).toBeLessThan(BUDGET_MS)
  })

  it('builds the excerpt of descriptions full of half-written links quickly', () => {
    for (const piece of ['[](', '[a](', '<https:', '[a](<https:']) {
      const text = `zz ${piece.repeat(Math.floor(9_990 / piece.length))}`
      expect(timeOfTwenty(text), piece).toBeLessThan(BUDGET_MS)
    }
  })
})
