// Tests des fonctions pures de la file de modération (moderation/present.ts).
//
// `viewHref` : où mène « Voir » dans la file. Un appel ou un message du coin des testeurs mène au
// coin (R7b, le fil est privé), le reste comme avant.
//
// R9 (7d) : une même cible peut donner plusieurs éléments de la file, un par partie signalée (le
// projet entier et sa 2e photo sont deux éléments). L'adresse de l'écran garde l'élément choisi
// (`?item=`) ; il lui faut donc une clé par élément, et la lecture inverse de cette clé.
// L'API attendue (fixée au découpage du plan) :
//   itemKey(target: StoredReportTarget, part: PartOut | ReportPart | null): string
//   parseItemKey(key: string): { target: StoredReportTarget; part: ReportPart | null } | null
//   partText(part: PartOut, t): string (« la photo 2 », textes `moderation.parts`)
// `parseItemKey` lit l'adresse : un texte que n'importe qui peut écrire. Elle rend null pour tout ce
// qui n'est pas une clé valide, sans jamais lever d'erreur, et sa partie suit le contrat
// (`ReportPart` : l'identifiant de la photo pour une photo, et seulement pour elle).
import type { PartOut, ReportPart, StoredReportTarget } from '@ruche/contracts'
import { fr } from '../testing/text'
import { itemKey, parseItemKey, partText, viewHref } from './present'

const projectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
const uuid = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

describe('viewHref', () => {
  it('leads a call to the « Appels » tab of the testers corner, not to the project page', () => {
    expect(viewHref({ kind: 'call', id: uuid }, projectId)).toEqual({
      pathname: '/projects/[id]/testers',
      params: { id: projectId, tab: 'calls' },
    })
  })

  it('leads a message to the « Retours » tab of the testers corner, not to the project page', () => {
    expect(viewHref({ kind: 'message', id: uuid }, projectId)).toEqual({
      pathname: '/projects/[id]/testers',
      params: { id: projectId, tab: 'feedback' },
    })
  })

  it('still leads a comment to its project, and a member to the member page', () => {
    expect(viewHref({ kind: 'comment', id: uuid }, projectId)).toEqual({
      pathname: '/projects/[id]',
      params: { id: projectId },
    })
    expect(viewHref({ kind: 'member', id: 'u7' }, null)).toEqual({
      pathname: '/members/[id]',
      params: { id: 'u7' },
    })
  })
})

// --- R9 : la clé d'un élément de la file ---

/** « Météo », le projet d'Inès, et deux de ses photos. */
const meteo: StoredReportTarget = { kind: 'project', id: projectId }
const secondPhotoId = '2b3c4d5e-6f70-4a81-9b2c-3d4e5f607182'
const thirdPhotoId = '3c4d5e6f-7081-4b92-8c3d-4e5f60718293'
/** La 2e photo, telle que la file la donne (`PartOut`, avec son rang). */
const secondPhoto: PartOut = { field: 'photo', mediaId: secondPhotoId, position: 2 }
const thirdPhoto: PartOut = { field: 'photo', mediaId: thirdPhotoId, position: 3 }
/** La description du projet, telle que la file la donne : sans photo, sans rang. */
const descriptionOut: PartOut = { field: 'description', mediaId: null, position: null }

describe('itemKey', () => {
  it('keeps apart two queue items of the same project, the whole project and its 2nd photo', () => {
    expect(itemKey(meteo, null)).not.toBe(itemKey(meteo, secondPhoto))
  })

  it('keeps apart two photos of the same project, and two fields of the same project', () => {
    expect(itemKey(meteo, secondPhoto)).not.toBe(itemKey(meteo, thirdPhoto))
    expect(itemKey(meteo, descriptionOut)).not.toBe(
      itemKey(meteo, { field: 'tools', mediaId: null, position: null }),
    )
    // Une photo et la description de cette même photo sont deux parties.
    expect(itemKey(meteo, secondPhoto)).not.toBe(
      itemKey(meteo, { field: 'photoDescription', mediaId: secondPhotoId, position: 2 }),
    )
  })

  it('keeps apart the same part of two different contents', () => {
    const other: StoredReportTarget = { kind: 'project', id: uuid }
    expect(itemKey(meteo, descriptionOut)).not.toBe(itemKey(other, descriptionOut))
    // Deux sortes différentes, même identifiant : deux cibles.
    expect(itemKey({ kind: 'update', id: uuid }, null)).not.toBe(
      itemKey({ kind: 'call', id: uuid }, null),
    )
  })

  it('gives the same key to a part read from the queue and the same part sent to the API', () => {
    // La file donne `PartOut` (mediaId null hors photo, et le rang) ; une décision envoie
    // `ReportPart` (sans mediaId hors photo, sans rang). C'est la même partie : la même clé.
    const descriptionIn: ReportPart = { field: 'description' }
    expect(itemKey(meteo, descriptionOut)).toBe(itemKey(meteo, descriptionIn))
    expect(itemKey(meteo, secondPhoto)).toBe(
      itemKey(meteo, { field: 'photo', mediaId: secondPhotoId }),
    )
  })

  it('does not change when the photo moves in the gallery', () => {
    // Le rang se lit au moment de la réponse : l'autrice a pu réordonner sa galerie depuis.
    expect(itemKey(meteo, secondPhoto)).toBe(itemKey(meteo, { ...secondPhoto, position: 1 }))
  })

  it('gives the same key twice for the same item', () => {
    expect(itemKey(meteo, secondPhoto)).toBe(itemKey({ ...meteo }, { ...secondPhoto }))
  })
})

describe('parseItemKey', () => {
  it('reads back a whole content', () => {
    expect(parseItemKey(itemKey(meteo, null))).toEqual({ target: meteo, part: null })
  })

  it('reads back a photo part with its photo, without its rank', () => {
    expect(parseItemKey(itemKey(meteo, secondPhoto))).toEqual({
      target: meteo,
      part: { field: 'photo', mediaId: secondPhotoId },
    })
  })

  it('reads back a part without photo as the API expects it, without any mediaId', () => {
    const parsed = parseItemKey(itemKey(meteo, descriptionOut))
    expect(parsed).toEqual({ target: meteo, part: { field: 'description' } })
    // `ReportPart` est strict : un `mediaId: null` ferait refuser la décision (400).
    expect(parsed?.part).not.toHaveProperty('mediaId')
  })

  it('reads back a part of a profile, whose id is not a uuid', () => {
    const karim: StoredReportTarget = { kind: 'member', id: 'u_karim-4' }
    expect(
      parseItemKey(itemKey(karim, { field: 'handle', mediaId: null, position: null })),
    ).toEqual({ target: karim, part: { field: 'handle' } })
  })

  it('reads back a comment, and an old note of the history', () => {
    const comment: StoredReportTarget = { kind: 'comment', id: uuid }
    const note: StoredReportTarget = { kind: 'note', id: uuid }
    expect(parseItemKey(itemKey(comment, null))).toEqual({ target: comment, part: null })
    expect(parseItemKey(itemKey(note, null))).toEqual({ target: note, part: null })
  })

  it('returns null for anything that is not a key, without throwing', () => {
    for (const key of [
      '',
      'n’importe quoi',
      'project',
      `project:${uuid}:photo:${uuid}:extra:stuff`,
      `castle:${uuid}`,
      'project:not-a-uuid',
      'null',
      '{}',
      '%E0%A4%A',
      '<script>alert(1)</script>',
    ]) {
      expect(parseItemKey(key)).toBeNull()
    }
  })

  it('returns null for a key whose part breaks the contract', () => {
    // Des clés fabriquées par itemKey à partir de parties fausses (comme une adresse écrite à la
    // main), quelle que soit la forme de la clé.
    expect(parseItemKey(itemKey(meteo, secondPhoto))).not.toBeNull() // témoin
    // Une photo sans sa photo.
    expect(parseItemKey(itemKey(meteo, { field: 'photo', mediaId: null, position: 2 }))).toBeNull()
    // Un identifiant de photo qui n'en est pas un.
    expect(
      parseItemKey(itemKey(meteo, { field: 'photo', mediaId: 'pas-une-photo', position: 2 })),
    ).toBeNull()
    // Une description de projet qui porterait une photo.
    expect(
      parseItemKey(
        itemKey(meteo, { field: 'description', mediaId: secondPhotoId, position: null }),
      ),
    ).toBeNull()
    // Une partie qui n'existe pas.
    expect(
      parseItemKey(
        itemKey(meteo, { field: 'castle', mediaId: null, position: null } as unknown as PartOut),
      ),
    ).toBeNull()
  })

  it('returns null for a part that this kind of content does not have', () => {
    // Un commentaire se signale en entier (REPORTABLE_PARTS) : aucune photo, aucun pseudo.
    const comment: StoredReportTarget = { kind: 'comment', id: uuid }
    expect(parseItemKey(itemKey(comment, secondPhoto))).toBeNull()
    expect(
      parseItemKey(itemKey(meteo, { field: 'handle', mediaId: null, position: null })),
    ).toBeNull()
  })
})

// --- R9 : le nom d'une partie, en minuscules (« Projet · la photo 2 ») ---

type T = Parameters<typeof partText>[1]
const text = (part: PartOut) => partText(part, fr.t as unknown as T)

describe('partText', () => {
  it('names a photo by its rank: « la photo 2 »', () => {
    expect(text(secondPhoto)).toBe(fr.t(($) => $.moderation.parts.photo, { n: 2 }))
    expect(text(secondPhoto)).toMatch(/2/)
  })

  it('names the description of a photo by the rank of the photo', () => {
    expect(text({ field: 'photoDescription', mediaId: thirdPhotoId, position: 3 })).toBe(
      fr.t(($) => $.moderation.parts.photoDescription, { n: 3 }),
    )
  })

  it.each([
    'description',
    'tools',
    'demoUrl',
    'cover',
    'prompt',
    'title',
    'pitch',
    'category',
    'text',
    'name',
    'handle',
    'bio',
    'favoriteTools',
    'avatar',
  ] as const)('names the part %s with its text of moderation.parts', (field) => {
    expect(text({ field, mediaId: null, position: null })).toBe(
      fr.t(($) => $.moderation.parts[field]),
    )
  })

  it('writes no placeholder when the rank of a photo is unknown', () => {
    // Le rang vaut null quand la photo n'est plus là : la phrase reste une phrase.
    const written = text({ field: 'photo', mediaId: secondPhotoId, position: null })
    expect(written).not.toBe('')
    expect(written).not.toMatch(/\{\{|undefined|null|NaN/)
  })
})
