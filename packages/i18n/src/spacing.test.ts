// Tests de la ponctuation des textes des membres (R18, scénario « Les textes des membres bien
// ponctués ») : l'espace que le membre a tapée devant ? ! ; : (et après « , avant ») devient
// insécable à l'affichage, pour que le signe ne parte jamais seul au début d'une ligne. La fonction
// ne fait que remplacer une espace ordinaire par une autre espace : elle n'ajoute ni ne retire rien,
// et la longueur du texte reste la même (le surlignage d'une recherche, calculé sur le texte
// enregistré, tombe donc toujours au bon endroit).
//
// Les espaces spéciales sont écrites par leur numéro (U+202F, U+00A0) : à l'œil, rien ne les
// distingue d'une espace ordinaire, et un éditeur peut les remplacer sans prévenir.
import { describe, expect, it } from 'vitest'
import * as i18n from './index'
import { keepPunctuation } from './spacing'

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)
/** L'espace insécable (U+00A0), devant : et à l'intérieur des guillemets « ». */
const NBSP = String.fromCodePoint(0x00a0)

describe('keepPunctuation', () => {
  it('turns the typed space before ? ! and ; into a narrow non-breaking space', () => {
    expect(keepPunctuation('Ça marche ?')).toBe(`Ça marche${NNBSP}?`)
    expect(keepPunctuation('Ça marche ? Oui !')).toBe(`Ça marche${NNBSP}? Oui${NNBSP}!`)
    expect(keepPunctuation('Le frigo ; la liste')).toBe(`Le frigo${NNBSP}; la liste`)
  })

  it('turns the typed space before a colon into a non-breaking space', () => {
    expect(keepPunctuation('Note : à tester')).toBe(`Note${NBSP}: à tester`)
  })

  it('keeps the spaces inside « » non-breaking', () => {
    expect(keepPunctuation('Il a dit « citation » hier')).toBe(
      `Il a dit «${NBSP}citation${NBSP}» hier`,
    )
  })

  it('adds nothing when the member typed no space (« Oui! », 10:30, an address)', () => {
    expect(keepPunctuation('Oui!')).toBe('Oui!')
    expect(keepPunctuation('Rendez-vous à 10:30')).toBe('Rendez-vous à 10:30')
    expect(keepPunctuation('https://x.y')).toBe('https://x.y')
    expect(keepPunctuation('Voir https://example.com/a?b=1;c=2')).toBe(
      'Voir https://example.com/a?b=1;c=2',
    )
    expect(keepPunctuation('«citation»')).toBe('«citation»')
  })

  it('leaves an English text without spaces before the punctuation unchanged', () => {
    const english = 'Does it work? Yes! Note: try it; then tell me.'
    expect(keepPunctuation(english)).toBe(english)
  })

  it('leaves a line break before the punctuation alone (only the ordinary space changes)', () => {
    // Le membre est allé à la ligne : c'est un choix de mise en page, pas une espace à protéger.
    expect(keepPunctuation('Ça marche\n?')).toBe('Ça marche\n?')
    expect(keepPunctuation('Ça marche\t?')).toBe('Ça marche\t?')
  })

  it('is idempotent', () => {
    const text = 'Ça marche ? Oui ! Note : « citation » ; fin'
    const once = keepPunctuation(text)
    expect(keepPunctuation(once)).toBe(once)
    // Témoin : la première passe a bien changé quelque chose.
    expect(once).not.toBe(text)
  })

  it('keeps the length of the text', () => {
    const texts = [
      'Ça marche ? Oui !',
      'Note : à tester',
      '« citation » ; fin',
      // Un emoji compte deux unités UTF-16 : il ne doit rien décaler.
      '🚀 Décollage ? Oui !',
    ]
    for (const text of texts) {
      const shown = keepPunctuation(text)
      // Témoin : chacun de ces textes change (une espace au moins devient insécable)…
      expect(shown).not.toBe(text)
      // … sans changer de longueur.
      expect(shown.length).toBe(text.length)
      // Chaque caractère reste à sa place : seules les espaces changent.
      for (let at = 0; at < text.length; at++) {
        if (text[at] !== shown[at]) {
          expect(text[at]).toBe(' ')
          expect([NNBSP, NBSP]).toContain(shown[at])
        }
      }
    }
  })

  it('is exported by the package index', () => {
    expect(i18n.keepPunctuation).toBe(keepPunctuation)
  })
})
