// Tests des règles de texte communes : ce qu'un nom, une bio ou un outil peut contenir.
import { describe, expect, it } from 'vitest'
import { DisplayName, FreeText, ShortLabel } from './text'

describe('DisplayName', () => {
  it('accepts names in any language, with accents and emoji', () => {
    expect(DisplayName.parse(' Léa ')).toBe('Léa')
    expect(DisplayName.parse('مريم')).toBe('مريم')
    // Le « 👩‍💻 » est fait de deux emoji reliés par un caractère invisible (U+200D) : il doit passer.
    expect(DisplayName.parse('Léa 👩‍💻')).toBe('Léa 👩‍💻')
  })

  it('refuses an empty name or one longer than 80 characters', () => {
    expect(DisplayName.safeParse('   ').success).toBe(false)
    expect(DisplayName.safeParse('a'.repeat(81)).success).toBe(false)
  })

  it('refuses a name made only of characters that look empty', () => {
    // Remplissage hangûl, braille vide, trait d'union conditionnel, liant, séparateur mongol.
    for (const blank of ['\u3164', '\u2800', '\u00AD', '\u200C', '\u180E', '\u3000']) {
      expect(DisplayName.safeParse(blank).success).toBe(false)
    }
  })

  it('refuses writing-direction marks, hidden « tag » characters and broken characters', () => {
    expect(DisplayName.safeParse('Léa\u200F').success).toBe(false) // marque droite-à-gauche
    expect(DisplayName.safeParse('Léa\u061C').success).toBe(false) // marque de lettre arabe
    // Les caractères « tag » (U+E0000…) peuvent cacher un texte entier, lisible par une IA.
    expect(DisplayName.safeParse('Léa\u{E0041}\u{E0042}').success).toBe(false)
    expect(DisplayName.safeParse('Léa\uD800').success).toBe(false) // moitié de caractère isolée
  })

  it('keeps the joiner used inside Persian words', () => {
    expect(DisplayName.parse('نیلو\u200Cفر')).toBe('نیلو\u200Cفر')
  })

  it('refuses invisible or control characters that could fake another name', () => {
    expect(DisplayName.safeParse('Léa\u0000').success).toBe(false) // caractère nul
    expect(DisplayName.safeParse('Léa\u202Eadmin').success).toBe(false) // inverse le sens du texte
    expect(DisplayName.safeParse('\u200B').success).toBe(false) // espace de largeur nulle
    expect(DisplayName.safeParse('Léa\nadmin').success).toBe(false) // retour à la ligne
  })
})

describe('FreeText', () => {
  it('keeps line breaks', () => {
    expect(FreeText(280).parse('Ligne 1\nLigne 2\tsuite')).toBe('Ligne 1\nLigne 2\tsuite')
  })

  it('refuses the null character, which the database cannot store', () => {
    expect(FreeText(280).safeParse('x\u0000').success).toBe(false)
  })
})

describe('ShortLabel', () => {
  it('refuses a line break or an invisible character', () => {
    expect(ShortLabel(40).safeParse('Claude\nCursor').success).toBe(false)
    expect(ShortLabel(40).safeParse('Clau\u200Bde').success).toBe(false)
  })
})
