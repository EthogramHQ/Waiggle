// Tests de nameOf (tranche 6c) : le nom d'un membre précédé de ce qui le relie au texte, pour
// « Voir la page d’Inès » / « Voir la page de Léa », et « See Inès’s page » en anglais.
// En français, « de » s'élide devant une voyelle (accents compris) ou un h : « d’Inès », « d’Hugo ».
// L'apostrophe est typographique (’, U+2019), comme dans tous les textes de l'appli.
import { describe, expect, it } from 'vitest'
import { fill, nameOf, resources } from './index'

describe('nameOf in French', () => {
  it('elides « de » before a vowel', () => {
    for (const name of ['Inès', 'Antoine', 'Emma', 'Oscar', 'Ugo']) {
      expect(nameOf('fr', name)).toBe(`d’${name}`)
    }
  })

  it('elides « de » before an accented vowel', () => {
    for (const name of ['Élodie', 'Ève', 'Émile', 'Îlona', 'Ôdile']) {
      expect(nameOf('fr', name)).toBe(`d’${name}`)
    }
  })

  it('elides « de » before a h', () => {
    expect(nameOf('fr', 'Hugo')).toBe('d’Hugo')
    expect(nameOf('fr', 'Hélène')).toBe('d’Hélène')
  })

  it('elides « de » before a name written in small letters', () => {
    expect(nameOf('fr', 'inès')).toBe('d’inès')
    expect(nameOf('fr', 'élodie')).toBe('d’élodie')
  })

  it('keeps « de » before a consonant, a digit or a symbol', () => {
    expect(nameOf('fr', 'Léa')).toBe('de Léa')
    expect(nameOf('fr', 'Max Durand')).toBe('de Max Durand')
    expect(nameOf('fr', 'Zoé')).toBe('de Zoé')
    expect(nameOf('fr', '42')).toBe('de 42')
    expect(nameOf('fr', '🐝 Abeille')).toBe('de 🐝 Abeille')
  })

  it('uses the typographic apostrophe, never the straight one', () => {
    expect(nameOf('fr', 'Inès')).toContain('’')
    expect(nameOf('fr', 'Inès')).not.toContain("'")
  })

  it('does not elide before an empty name, and does not fail', () => {
    expect(nameOf('fr', '')).not.toContain('’')
  })
})

describe('nameOf in English', () => {
  it('adds « ’s » to the name', () => {
    expect(nameOf('en', 'Inès')).toBe('Inès’s')
    expect(nameOf('en', 'Léa')).toBe('Léa’s')
    expect(nameOf('en', 'Max Durand')).toBe('Max Durand’s')
  })

  it('does not fail on an empty name', () => {
    expect(() => nameOf('en', '')).not.toThrow()
  })
})

describe('the texts that use nameOf', () => {
  it('writes the link to a member page in both languages', () => {
    expect(fill(resources.fr.translation.member.open, { nameOf: nameOf('fr', 'Inès') })).toBe(
      'Voir la page d’Inès',
    )
    expect(fill(resources.fr.translation.member.open, { nameOf: nameOf('fr', 'Léa') })).toBe(
      'Voir la page de Léa',
    )
    expect(fill(resources.en.translation.member.open, { nameOf: nameOf('en', 'Inès') })).toBe(
      'See Inès’s page',
    )
  })

  it('writes the label of a note in the feed in both languages', () => {
    const params = (language: 'fr' | 'en') => ({
      nameOf: nameOf(language, 'Inès'),
      title: 'Météo',
    })
    expect(fill(resources.fr.translation.feed.noteLabel, params('fr'))).toBe(
      'Note d’Inès sur Météo',
    )
    expect(fill(resources.en.translation.feed.noteLabel, params('en'))).toBe('Inès’s note on Météo')
  })
})
