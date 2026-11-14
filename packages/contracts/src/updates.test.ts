// Tests du contrat des mises à jour d'un projet (tranche R7a) : ce que POST /v1/projects/{id}/updates
// accepte (NewProjectUpdate), et ce que l'API relit sans confiance (UpdateLineOut, ProjectUpdate).
// Scénario : docs/scenarios/refonte.md, section R7a, « Publier une mise à jour ».
//
// Les caractères invisibles sont fabriqués par String.fromCodePoint dans des constantes nommées :
// écrits tels quels dans le fichier, ils seraient impossibles à relire (et un outil pourrait les
// effacer sans qu'on le voie).
import { describe, expect, it } from 'vitest'
import {
  NewProjectUpdate,
  ProjectUpdate,
  UPDATE_LINE_MAX,
  UPDATE_LINES_MAX,
  UPDATE_PHOTOS_MAX,
  UPDATE_TITLE_MAX,
  UPDATE_VERSION_MAX,
  UpdateFamily,
  UpdateLine,
  UpdateLineOut,
} from './updates'

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const BELL = String.fromCodePoint(0x07)
const COMBINING_GRAPHEME_JOINER = String.fromCodePoint(0x034f)

/** Deux identifiants de photos en attente, bien formés. */
const PHOTO_A = '11111111-1111-4111-8111-111111111111'
const PHOTO_B = '22222222-2222-4222-8222-222222222222'
const PHOTO_C = '33333333-3333-4333-8333-333333333333'
const PHOTO_D = '44444444-4444-4444-8444-444444444444'
const PHOTO_E = '55555555-5555-4555-8555-555555555555'

/** Une mise à jour valide, la plus simple : une seule ligne, rien d'autre. */
const minimal = {
  title: null,
  version: null,
  lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
  photos: [],
  beforeAfter: false,
}

const accepts = (input: unknown) => NewProjectUpdate.safeParse(input).success
const photo = (id: string, description: string | null = null) => ({ id, description })

describe('NewProjectUpdate, the lines', () => {
  it('accepts one to five lines, in the three families', () => {
    expect(accepts(minimal)).toBe(true)
    const five = ['new', 'fixed', 'polish', 'new', 'fixed'].map((family, i) => ({
      family,
      text: `Changement ${i + 1}`,
    }))
    expect(five).toHaveLength(UPDATE_LINES_MAX)
    expect(accepts({ ...minimal, lines: five })).toBe(true)
  })

  it('refuses no line at all, and a sixth line', () => {
    expect(accepts({ ...minimal, lines: [] })).toBe(false)
    const six = Array.from({ length: UPDATE_LINES_MAX + 1 }, (_, i) => ({
      family: 'new',
      text: `Changement ${i + 1}`,
    }))
    expect(accepts({ ...minimal, lines: six })).toBe(false)
  })

  it('knows only three families, by their stable codes', () => {
    expect(UpdateFamily.options).toEqual(['new', 'fixed', 'polish'])
    for (const family of ['bug', 'New', '', null]) {
      expect(
        accepts({ ...minimal, lines: [{ family, text: 'Un changement' }] }),
        String(family),
      ).toBe(false)
    }
  })

  it('takes 120 characters on a line, not 121, counted as letters', () => {
    // Des lettres accentuées : la limite compte des caractères, pas des octets.
    expect(UpdateLine.safeParse({ family: 'new', text: 'é'.repeat(UPDATE_LINE_MAX) }).success).toBe(
      true,
    )
    expect(
      UpdateLine.safeParse({ family: 'new', text: 'é'.repeat(UPDATE_LINE_MAX + 1) }).success,
    ).toBe(false)
  })

  it('trims a line, and refuses an empty one, even made of spaces', () => {
    expect(
      UpdateLine.parse({ family: 'fixed', text: '  Le score ne repart plus à zéro  ' }),
    ).toEqual({ family: 'fixed', text: 'Le score ne repart plus à zéro' })
    for (const text of ['', '   ']) {
      expect(UpdateLine.safeParse({ family: 'new', text }).success, JSON.stringify(text)).toBe(
        false,
      )
    }
  })

  it('refuses a line break, invisible or control characters, and a line that shows nothing', () => {
    for (const text of [
      'Deux\nlignes',
      `Mode nuit${ZERO_WIDTH_SPACE}`,
      `Mode nuit${BELL}`,
      `${RIGHT_TO_LEFT_OVERRIDE}Mode nuit`,
      COMBINING_GRAPHEME_JOINER,
    ]) {
      expect(UpdateLine.safeParse({ family: 'new', text }).success, JSON.stringify(text)).toBe(
        false,
      )
    }
  })

  it('refuses a line with another field', () => {
    expect(
      accepts({ ...minimal, lines: [{ family: 'new', text: 'Mode nuit', author: 'Jean' }] }),
    ).toBe(false)
  })
})

describe('NewProjectUpdate, the title and the version', () => {
  it('takes no title and no version as null', () => {
    expect(NewProjectUpdate.parse(minimal)).toMatchObject({ title: null, version: null })
  })

  it('takes a title of 60 characters and a version of 20, not more', () => {
    expect(
      accepts({
        ...minimal,
        title: 'T'.repeat(UPDATE_TITLE_MAX),
        version: 'v'.repeat(UPDATE_VERSION_MAX),
      }),
    ).toBe(true)
    expect(accepts({ ...minimal, title: 'T'.repeat(UPDATE_TITLE_MAX + 1) })).toBe(false)
    expect(accepts({ ...minimal, version: 'v'.repeat(UPDATE_VERSION_MAX + 1) })).toBe(false)
  })

  it('trims the title and the version, and refuses them empty or invisible', () => {
    expect(
      NewProjectUpdate.parse({ ...minimal, title: '  Le décompte  ', version: ' v1.2 ' }),
    ).toMatchObject({ title: 'Le décompte', version: 'v1.2' })
    for (const text of ['', '  ', `v1${ZERO_WIDTH_SPACE}`, 'v1\nv2']) {
      expect(accepts({ ...minimal, title: text }), `title ${JSON.stringify(text)}`).toBe(false)
      expect(accepts({ ...minimal, version: text }), `version ${JSON.stringify(text)}`).toBe(false)
    }
  })

  it('refuses a missing field and an unknown one', () => {
    const { title: _title, ...withoutTitle } = minimal
    expect(accepts(withoutTitle)).toBe(false)
    expect(accepts({ ...minimal, projectId: PHOTO_A })).toBe(false)
  })
})

describe('NewProjectUpdate, the photos and the before / after', () => {
  it('accepts four photos at most, each with an optional description', () => {
    const four = [
      photo(PHOTO_A, 'La fusée de jour'),
      photo(PHOTO_B),
      photo(PHOTO_C),
      photo(PHOTO_D),
    ]
    expect(four).toHaveLength(UPDATE_PHOTOS_MAX)
    expect(accepts({ ...minimal, photos: four })).toBe(true)
    expect(accepts({ ...minimal, photos: [...four, photo(PHOTO_E)] })).toBe(false)
  })

  it('refuses the same photo twice', () => {
    expect(accepts({ ...minimal, photos: [photo(PHOTO_A), photo(PHOTO_A, 'Encore elle')] })).toBe(
      false,
    )
  })

  it('refuses a photo whose identifier is not a uuid, or with another field', () => {
    expect(accepts({ ...minimal, photos: [photo('pas-un-identifiant')] })).toBe(false)
    expect(accepts({ ...minimal, photos: [{ ...photo(PHOTO_A), slot: 'gallery' }] })).toBe(false)
  })

  it('turns an empty description into null, and refuses one of 251 characters', () => {
    const parsed = NewProjectUpdate.parse({ ...minimal, photos: [photo(PHOTO_A, '   ')] })
    expect(parsed.photos).toEqual([{ id: PHOTO_A, description: null }])
    expect(accepts({ ...minimal, photos: [photo(PHOTO_A, 'd'.repeat(251))] })).toBe(false)
  })

  it('refuses a before / after with fewer than two photos', () => {
    expect(accepts({ ...minimal, beforeAfter: true })).toBe(false)
    expect(accepts({ ...minimal, beforeAfter: true, photos: [photo(PHOTO_A)] })).toBe(false)
    expect(
      accepts({ ...minimal, beforeAfter: true, photos: [photo(PHOTO_A), photo(PHOTO_B)] }),
    ).toBe(true)
  })

  it('names the before / after when it refuses it', () => {
    const result = NewProjectUpdate.safeParse({ ...minimal, beforeAfter: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['beforeAfter'])
  })
})

describe('what the API reads back without trusting it (sec-A7)', () => {
  it('reads a stored line without checking its text again', () => {
    // Une ligne gardée en base avant une règle plus stricte (ou abîmée) ne casse pas la lecture :
    // c'est l'API qui écarte une ligne invalide, pas le schéma de sortie qui lève une erreur.
    expect(UpdateLineOut.parse({ family: 'new', text: 'x'.repeat(500) }).text).toHaveLength(500)
    expect(UpdateLineOut.safeParse({ family: 'other', text: 'Mode nuit' }).success).toBe(false)
  })

  it('never describes a published update without a line', () => {
    const update = {
      id: PHOTO_A,
      title: null,
      version: 'v1.2',
      lines: [{ family: 'polish', text: 'Des étoiles qui scintillent' }],
      photos: [],
      beforeAfter: false,
      createdAt: '2026-10-19T09:00:00.000Z',
      removal: null,
      removedParts: [], // R9 : aucune partie retirée
    }
    expect(ProjectUpdate.safeParse(update).success).toBe(true)
    expect(ProjectUpdate.safeParse({ ...update, lines: [] }).success).toBe(false)
  })
})
