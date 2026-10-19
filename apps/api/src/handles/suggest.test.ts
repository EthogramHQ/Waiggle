// Tests de la fabrication d'un pseudo à partir du nom (tranche 6a), une fonction pure : pas de base,
// pas de réseau. Le numéro ajouté quand le pseudo est pris (« ines_morel2 ») ne se décide pas ici,
// mais dans ensureHandle (handles.test.ts). Scénario : docs/scenarios/phase-1.md,
// « Précisions (tranche 6a) », règle « Fabrication ».
import { Handle } from '@ruche/contracts'
import { textVariables } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import { suggestHandle } from './suggest'

// La forme d'un pseudo valide (voir packages/contracts/src/handles.ts) : une lettre d'abord.
const handleShape = /^[a-z][a-z0-9_]{2,19}$/

describe('suggestHandle', () => {
  it('writes the name without accents, in lowercase, words joined by « _ »', () => {
    expect(suggestHandle('Inès Morel', 'fr')).toBe('ines_morel')
    expect(suggestHandle('Élodie Çaron', 'fr')).toBe('elodie_caron')
    expect(suggestHandle('ZOÉ', 'en')).toBe('zoe')
  })

  it('turns every other character into a single « _ », never at the start or the end', () => {
    expect(suggestHandle('Jean-Luc O’Neil !', 'fr')).toBe('jean_luc_o_neil')
    expect(suggestHandle('Max  &  Co', 'fr')).toBe('max_co')
    expect(suggestHandle('  --Léa--  ', 'fr')).toBe('lea')
    expect(suggestHandle('Zoé 👩‍💻', 'fr')).toBe('zoe')
  })

  it('keeps the digits of the name', () => {
    expect(suggestHandle('Max 2000', 'fr')).toBe('max_2000')
  })

  it('keeps 16 characters at most, so that a number still fits within 20', () => {
    expect(suggestHandle('Maximilien Robespierre', 'fr')).toBe('maximilien_robes')
  })

  it('never ends with « _ » after cutting the name', () => {
    // « alexandre_dumas_fils » coupé à 16 donnerait « alexandre_dumas_ ».
    expect(suggestHandle('Alexandre Dumas Fils', 'fr')).toBe('alexandre_dumas')
  })

  it('adds a digit to a name too short for a handle', () => {
    expect(suggestHandle('Al', 'fr')).toBe('al1')
  })

  it('starts with « membre_ » or « member_ », in the language of the account, when the name starts with a digit', () => {
    expect(suggestHandle('2Pac', 'fr')).toBe('membre_2pac')
    expect(suggestHandle('2Pac', 'en')).toBe('member_2pac')
  })

  it('starts with « membre_ » or « member_ » when nothing is left of a name in another alphabet', () => {
    for (const name of ['李小龙', 'مريم', '🐝']) {
      expect(suggestHandle(name, 'fr'), name).toMatch(/^membre_/)
      expect(suggestHandle(name, 'en'), name).toMatch(/^member_/)
    }
  })

  it('leaves out the name of the app, which no handle may contain', () => {
    const app = textVariables.appName
    expect(suggestHandle(`Fan de ${app}`, 'fr')).toBe('fan_de')
    expect(suggestHandle(`${app}Lover`, 'en')).toBe('lover')
    expect(suggestHandle(app, 'fr')).toMatch(/^membre_/)
    expect(Handle.safeParse(suggestHandle(`Ruche ${app} Ruche`, 'en')).success).toBe(true)
  })

  it('always gives a valid handle of 16 characters at most', () => {
    const names = [
      'Inès Morel',
      'Al',
      'A',
      '2Pac',
      '2 Fast 2 Furious Forever',
      '李小龙',
      '___',
      '1234567890123456789',
      'Anne-Marie de la Tour du Pin',
      'x'.repeat(80),
    ]
    for (const name of names) {
      for (const language of ['fr', 'en'] as const) {
        const handle = suggestHandle(name, language)
        expect(handle, `${name} (${language})`).toMatch(handleShape)
        expect(handle.length, `${name} (${language})`).toBeLessThanOrEqual(16)
      }
    }
  })
})
