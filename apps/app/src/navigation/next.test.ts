// Tests de safeNext : seule une page de l'appli, parmi celles où revenir a un sens, peut servir de
// retour après la connexion.
import { safeNext } from './next'

describe('safeNext', () => {
  it('keeps a page a visitor may have been sent from', () => {
    for (const value of [
      '/members/AbC123_xyz-9',
      '/projects/6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f',
      '/projects/6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f/edit',
      '/projects/new',
      '/tags/claude-code?x=1',
      '/account',
      '/account/delete',
      '/profile',
    ]) {
      expect(safeNext(value)).toBe(value)
    }
  })

  it('refuses another site, however it is written', () => {
    for (const value of [
      'https://faux.example',
      '//faux.example',
      '/\\faux.example',
      'javascript:alert(1)',
      'members/abc',
      '/members/abc\n',
      '/\t/faux.example',
      '/ /x',
      '/／/faux.example',
      '/%2F%2Ffaux.example',
      '/%5Cfaux.example',
      '/%252F%252Ffaux.example',
      '/members/%2f%2ffaux.example',
    ]) {
      expect(safeNext(value)).toBeNull()
    }
  })

  it('refuses pages that make no sense to come back to', () => {
    for (const value of [
      '/out?url=https://faux-waiggle.example/connexion',
      '/check-email?email=x@example.com',
      '/sign-in',
      '/sign-up?next=/members/x',
      '/accounts',
      '/',
    ]) {
      expect(safeNext(value)).toBeNull()
    }
  })

  it('refuses nothing and a very long path', () => {
    expect(safeNext(undefined)).toBeNull()
    expect(safeNext('')).toBeNull()
    expect(safeNext(`/members/${'a'.repeat(600)}`)).toBeNull()
  })
})
