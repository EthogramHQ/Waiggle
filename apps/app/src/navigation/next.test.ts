// Tests de safeNext : seule une page de l'appli peut servir de retour après la connexion.
import { safeNext } from './next'

describe('safeNext', () => {
  it('keeps a page of the app', () => {
    expect(safeNext('/members/AbC123_xyz-9')).toBe('/members/AbC123_xyz-9')
    expect(safeNext('/tags/claude-code?x=1')).toBe('/tags/claude-code?x=1')
  })

  it('refuses another site, however it is written', () => {
    for (const value of [
      'https://faux.example',
      '//faux.example',
      '/\\faux.example',
      'javascript:alert(1)',
      'members/abc',
      '/members/abc\n',
    ]) {
      expect(safeNext(value)).toBeNull()
    }
  })

  it('refuses nothing, a very long path, and the sign-in pages themselves', () => {
    expect(safeNext(undefined)).toBeNull()
    expect(safeNext('')).toBeNull()
    expect(safeNext(`/${'a'.repeat(600)}`)).toBeNull()
    expect(safeNext('/sign-in')).toBeNull()
    expect(safeNext('/sign-up?next=/x')).toBeNull()
  })
})
