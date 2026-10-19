// Tests de la forme d'un pseudo (tranche 6a) : ce qu'un membre peut taper, comment on le nettoie,
// et les codes d'erreur que lit l'appli pour choisir son message. Scénario :
// docs/scenarios/phase-1.md, « Précisions (tranche 6a) ».
import { textVariables } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import {
  HANDLE_FORBIDDEN_PARTS,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  Handle,
  RESERVED_HANDLES,
} from './handles'
import { ProfileUpdate } from './profile'

/** Les codes des problèmes trouvés par le schéma (vide : le pseudo est accepté). */
const issueCodes = (text: string) => {
  const parsed = Handle.safeParse(text)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.code)
}

describe('Handle', () => {
  it('accepts lowercase letters, digits and underscores, starting with a letter', () => {
    expect(Handle.parse('ines_morel')).toBe('ines_morel')
    expect(Handle.parse('max2')).toBe('max2')
    expect(Handle.parse('a_1')).toBe('a_1')
  })

  it('lowers the case and removes an « @ » typed at the start, and the spaces around', () => {
    expect(Handle.parse('@Ines')).toBe('ines')
    expect(Handle.parse('  INES_Morel ')).toBe('ines_morel')
    expect(Handle.parse(' @ines ')).toBe('ines')
  })

  it('removes a single « @ » only: two of them are refused', () => {
    expect(Handle.safeParse('@@ines').success).toBe(false)
  })

  it('takes 3 to 20 characters', () => {
    expect(Handle.parse('a'.repeat(HANDLE_MIN_LENGTH))).toHaveLength(3)
    expect(Handle.parse('a'.repeat(HANDLE_MAX_LENGTH))).toHaveLength(20)
    expect(issueCodes('ab')).toEqual(['too_small'])
    expect(issueCodes('a'.repeat(21))).toEqual(['too_big'])
  })

  it('counts the length after removing the « @ »', () => {
    // « @ab » fait 3 caractères tapés, mais le pseudo n'en a que 2.
    expect(issueCodes('@ab')).toEqual(['too_small'])
    expect(Handle.parse(`@${'a'.repeat(20)}`)).toHaveLength(20)
  })

  it('refuses a handle that does not start with a letter', () => {
    expect(issueCodes('1nes')).toEqual(['invalid_format'])
    expect(issueCodes('_ines')).toEqual(['invalid_format'])
  })

  it('refuses accents, look-alike letters, spaces and other symbols', () => {
    // Le « і » de « іnes » est cyrillique : il ressemble à un « i » sans en être un (un sosie).
    for (const text of ['inès', 'іnes', 'ines morel', 'ines-morel', 'ines.morel', 'ines@x']) {
      expect(issueCodes(text), text).toEqual(['invalid_format'])
    }
  })

  it('refuses the reserved words, whatever their case, with their own code', () => {
    for (const word of ['admin', 'Support', '@moderateur', 'everyone', 'ruche']) {
      expect(issueCodes(word), word).toEqual(['custom'])
    }
  })

  it('refuses the name of the app, which is written nowhere else than in the brand', () => {
    const name = textVariables.appName
    expect(RESERVED_HANDLES.has(name.toLowerCase())).toBe(true)
    expect(issueCodes(name)).toEqual(['custom'])
    expect(issueCodes(`@${name.toUpperCase()}`)).toEqual(['custom'])
  })

  it('refuses a double « _ » and a final « _ », which would imitate another handle', () => {
    expect(issueCodes('ines__morel')).toEqual(['invalid_format'])
    expect(issueCodes('ines_morel_')).toEqual(['invalid_format'])
    expect(Handle.parse('ines_m_2')).toBe('ines_m_2')
  })

  it('refuses any handle that contains the name of the app or its code name', () => {
    const name = textVariables.appName.toLowerCase()
    expect(HANDLE_FORBIDDEN_PARTS).toContain(name)
    for (const handle of [`${name}_team`, `support_${name}`, `my${name}2`, 'admin_ruche']) {
      expect(issueCodes(handle), handle).toEqual(['custom'])
    }
  })

  it('only reserves words that would otherwise be valid handles', () => {
    // Un mot réservé qui ne respecterait pas la forme ne protégerait rien : il serait déjà refusé.
    for (const word of RESERVED_HANDLES) {
      expect(word, word).toMatch(/^[a-z][a-z0-9_]{2,19}$/)
    }
  })
})

describe('ProfileUpdate and the handle', () => {
  it('accepts a new handle, cleaned up like the others', () => {
    expect(ProfileUpdate.parse({ handle: '@Ines' })).toEqual({ handle: 'ines' })
  })

  it('keeps the handle optional', () => {
    expect(ProfileUpdate.parse({ bio: 'Coucou' })).toEqual({ bio: 'Coucou' })
  })

  it('tells where the problem is, so that the app can show it under the right field', () => {
    const parsed = ProfileUpdate.safeParse({ handle: '1nes' })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([['handle']])
  })
})
