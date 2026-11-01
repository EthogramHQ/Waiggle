// Tests de l'ordre de Tab arrangé (tabOrder.ts) : « Annuler », posé au bout de la liste, se place
// pour le clavier juste après le « × » qui a reçu le focus, sans rien déplacer dans la page.
import { nextInTabOrder } from './tabOrder'

// L'ordre de la page : deux lignes (nom, projet, Suivre, ×), puis « Annuler », puis la suite.
const page = [
  'nom2',
  'projet2',
  'suivre2',
  'x2',
  'nom3',
  'projet3',
  'suivre3',
  'x3',
  'annuler',
  'suite',
]
const next = (active: string, backwards = false) =>
  nextInTabOrder(page, active, 'x2', 'annuler', backwards)

describe('nextInTabOrder', () => {
  it('goes from the focused « × » to « Annuler » with Tab', () => {
    expect(next('x2')).toBe('annuler')
  })

  it('goes on with the rest of the list after « Annuler »', () => {
    expect(next('annuler')).toBe('nom3')
  })

  it('walks the same path back with Shift+Tab', () => {
    expect(next('nom3', true)).toBe('annuler')
    expect(next('annuler', true)).toBe('x2')
  })

  it('skips « Annuler » where the page had it, both ways', () => {
    expect(next('x3')).toBe('suite')
    expect(next('suite', true)).toBe('x3')
  })

  it('leaves the browser alone where both orders agree', () => {
    expect(next('nom2')).toBeNull()
    expect(next('projet3', true)).toBeNull()
  })

  it('does nothing when the anchor is not in the page any more', () => {
    expect(nextInTabOrder(page, 'x3', 'parti', 'annuler', false)).toBeNull()
  })
})
