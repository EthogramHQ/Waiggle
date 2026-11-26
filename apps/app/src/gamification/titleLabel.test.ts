// Tests du libellé d'un titre de la récolte (R19), et du titre à part des Éclaireuses (R20,
// docs/scenarios/refonte.md, « Le titre et le sceau ») : « Éclaireuse », « Éclaireur » au
// masculin, « Scout » en anglais. `titleLabel` accepte un `TitleFamily` (les quatre familles et
// `scout`, contrat `game.ts`), pour que les réglages et le profil écrivent le titre de la même façon.
import { TITLE_FAMILIES } from '@ruche/contracts'
import { createI18n } from '../i18n'
import { titleLabel } from './titleLabel'

const fr = createI18n('fr')
const en = createI18n('en')
type T = Parameters<typeof titleLabel>[0]

describe('titleLabel', () => {
  it('writes the scout title in both forms, in French', () => {
    expect(titleLabel(fr.t as unknown as T, 'scout', 'f')).toBe('Éclaireuse')
    expect(titleLabel(fr.t as unknown as T, 'scout', 'm')).toBe('Éclaireur')
  })

  it('writes the scout title « Scout » in English', () => {
    expect(titleLabel(en.t as unknown as T, 'scout', 'f')).toBe('Scout')
  })

  it('writes a title for every family that can be worn', () => {
    for (const family of TITLE_FAMILIES)
      expect(titleLabel(fr.t as unknown as T, family, 'f')).not.toMatch(/^game\./)
    // Témoin : une famille de R19.
    expect(titleLabel(fr.t as unknown as T, 'keeper', 'f')).toBe('Gardienne')
  })
})
