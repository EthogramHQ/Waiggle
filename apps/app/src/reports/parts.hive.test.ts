// Tests de la cible « ruche » dans le parcours de signalement (R10, scénario « La modération ») : la
// feuille « Signaler » propose « Toute la ruche » et sa seule partie, « Le nom ». Pas de miniature,
// pas de rang : le nom et l'icône ne sont pas des photos.
import { ReportPart, type ReportTargetPreview } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'
import { fr } from '../testing/text'
import { partChoices, partLabel } from './parts'

type T = ReturnType<typeof useTranslation>['t']
const t = fr.t as unknown as T

const hiveId = '5e6f7a8b-9cad-4eaf-8b1c-2d3e4f5a6b7c'

/** Ce que GET /v1/reports/target rend d'une ruche : l'animateur y est montré comme auteur. */
const famille: ReportTargetPreview = {
  target: { kind: 'hive', id: hiveId },
  text: 'Famille',
  projectId: null,
  author: { id: 'jean-id', name: 'Papi Jean', handle: 'papi_jean', isBlocked: false },
  head: { title: null, authorName: 'Papi Jean', image: null },
  parts: [{ field: 'name', mediaId: null, position: null, thumb: null, reportedByMe: false }],
  reportedByMe: false,
  remainingToday: 20,
}

describe('partChoices of a hive', () => {
  it('offers the whole hive first, then its name', () => {
    const choices = partChoices(famille, t)

    expect(choices.map((choice) => choice.label)).toEqual([
      fr.t(($) => $.report.whole.hive),
      'Le nom',
    ])
    expect(choices[0]?.part).toBeNull()
    expect(choices[0]?.thumb).toBeNull()
  })

  it('sends the name as a part the API accepts, without any media', () => {
    const name = partChoices(famille, t).find((choice) => choice.label === 'Le nom')

    expect(name?.part).toEqual({ field: 'name' })
    expect(ReportPart.safeParse(name?.part).success).toBe(true)
    expect(name?.thumb).toBeNull()
  })

  it('gives each choice its own key', () => {
    const keys = partChoices(famille, t).map((choice) => choice.key)

    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
  })

  it('names the name of a hive like the name of a profile', () => {
    expect(partLabel({ field: 'name' }, famille, t)).toBe('Le nom')
  })
})
