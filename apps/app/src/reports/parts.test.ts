// Tests des parties qu'on peut signaler (R9, 7d, scénario « Les parties ») : la feuille « Signaler »
// demande d'abord « Quelle partie ? » ; ce fichier vérifie la liste de ses choix, tirée de l'aperçu
// que rend l'API (`ReportTargetPreview.parts`), et le nom d'une partie (« La 2e photo »).
//
// L'API attendue de `reports/parts.ts` (fixée au découpage du plan de R9) :
//   partChoices(preview: ReportTargetPreview, t): { key: string; part: ReportPart | null;
//     label: string; thumb: ProjectImage | null }[]
//     `null` : tout le contenu, toujours en tête ; puis les parties, dans l'ordre de l'aperçu (celui
//     du contrat, REPORTABLE_PARTS). Un contenu sans partie (un commentaire) : aucun choix, la
//     feuille commence au motif.
//   partLabel(part: ReportPart, preview: ReportTargetPreview, t): string
//     le nom d'une partie ; une photo par son rang dans l'aperçu (« La 2e photo »).
// Des fonctions pures, à part des hooks de `reports/api.ts` : les tests de la feuille remplacent ce
// module-là sans perdre celles-ci (`code.md`, « Fonctions pures à part »).
import { ReportPart, type ReportPartField, type ReportTargetPreview } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'
import { fr } from '../testing/text'
import { partChoices, partLabel } from './parts'

type T = ReturnType<typeof useTranslation>['t']
const t = fr.t as unknown as T

// --- L'aperçu de « Météo », le projet d'Inès, tel que le rend GET /v1/reports/target ---

const projectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
/** Les trois photos de la galerie ; la première est aussi la couverture. */
const photo1 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const photo2 = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const photo3 = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'
const thumbOf = (id: string) => ({
  url: `https://media.example.com/${id}.webp`,
  thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
})

type PreviewPart = ReportTargetPreview['parts'][number]
/** Une partie sans photo, telle que l'API la rend. */
const textPart = (field: ReportPartField): PreviewPart => ({
  field,
  mediaId: null,
  position: null,
  thumb: null,
  reportedByMe: false,
})
/** Une partie qui vise une photo : son identifiant, son rang (à partir de 1), sa miniature. */
const mediaPart = (field: ReportPartField, mediaId: string, position: number): PreviewPart => ({
  field,
  mediaId,
  position,
  thumb: thumbOf(mediaId),
  reportedByMe: false,
})

const ines = {
  id: 'u-ines',
  name: 'Inès Haddad',
  handle: 'ines_haddad',
  isBlocked: false,
  isAdmin: false,
}

const meteo: ReportTargetPreview = {
  target: { kind: 'project', id: projectId },
  text: 'Météo · La pluie heure par heure',
  projectId,
  author: ines,
  head: { title: 'Météo', authorName: 'Inès Haddad', image: thumbOf(photo1) },
  parts: [
    textPart('title'),
    textPart('pitch'),
    textPart('description'),
    textPart('category'),
    textPart('tools'),
    textPart('demoUrl'),
    mediaPart('cover', photo1, 1),
    mediaPart('photo', photo1, 1),
    mediaPart('photo', photo2, 2),
    mediaPart('photo', photo3, 3),
    mediaPart('photoDescription', photo2, 2),
    textPart('prompt'),
  ],
  reportedByMe: false,
  remainingToday: 20,
}

/** Le même aperçu pour une autre sorte de contenu. */
const previewOf = (
  kind: ReportTargetPreview['target']['kind'],
  parts: PreviewPart[],
): ReportTargetPreview => ({
  ...meteo,
  target: { kind, id: kind === 'member' ? 'u-ines' : '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a' },
  projectId: kind === 'member' ? null : projectId,
  head: { title: null, authorName: 'Inès Haddad', image: null },
  parts,
})

const labels = (preview: ReportTargetPreview) =>
  partChoices(preview, t).map((choice) => choice.label)

// --- Les choix ---

describe('partChoices', () => {
  it('puts the whole content first, chosen with no part', () => {
    const [first] = partChoices(meteo, t)

    expect(first?.label).toBe(fr.t(($) => $.report.whole.project))
    expect(first?.part).toBeNull()
    expect(first?.thumb).toBeNull()
  })

  it('names each part of a project in the order of the page, photos by their rank', () => {
    expect(labels(meteo)).toEqual([
      'Tout le projet',
      'Le titre',
      'Le pitch',
      'La description',
      'La catégorie',
      'Les outils',
      'Le lien de la démo',
      'La couverture',
      'La 1re photo',
      'La 2e photo',
      'La 3e photo',
      'La description de la 2e photo',
      'Le prompt de départ',
    ])
  })

  it('offers only the parts present on the page: no prompt, no photo', () => {
    const plain = {
      ...meteo,
      parts: [textPart('title'), textPart('pitch'), textPart('category')],
    }

    expect(labels(plain)).toEqual(['Tout le projet', 'Le titre', 'Le pitch', 'La catégorie'])
  })

  it('gives each choice a part the API accepts, a photo with its own id', () => {
    const choices = partChoices(meteo, t).filter((choice) => choice.part !== null)

    // Témoin : toutes les parties de l'aperçu sont là.
    expect(choices).toHaveLength(meteo.parts.length)
    for (const choice of choices) expect(ReportPart.safeParse(choice.part).success).toBe(true)
    const second = choices.find((choice) => choice.label === 'La 2e photo')
    expect(second?.part).toEqual({ field: 'photo', mediaId: photo2 })
    const cover = choices.find((choice) => choice.label === 'La couverture')
    expect(cover?.part).toEqual({ field: 'cover', mediaId: photo1 })
    const description = choices.find((choice) => choice.label === 'La description')
    expect(description?.part).toEqual({ field: 'description' })
  })

  it('gives each choice its own key, the cover and the 1st photo included', () => {
    const keys = partChoices(meteo, t).map((choice) => choice.key)

    // Témoin : un choix par partie, plus « Tout le projet ».
    expect(keys).toHaveLength(meteo.parts.length + 1)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('shows the thumbnail of the cover and of each photo, none for a text part', () => {
    const thumbs = Object.fromEntries(
      partChoices(meteo, t).map((choice) => [choice.label, choice.thumb?.url ?? null]),
    )

    expect(thumbs['La couverture']).toBe(thumbOf(photo1).url)
    expect(thumbs['La 2e photo']).toBe(thumbOf(photo2).url)
    expect(thumbs['La 3e photo']).toBe(thumbOf(photo3).url)
    expect(thumbs['Le titre']).toBeNull()
    expect(thumbs['Tout le projet']).toBeNull()
  })

  it('writes « 1re » for the first photo, then « 2e », « 10e »', () => {
    const many = {
      ...meteo,
      parts: [
        mediaPart('photo', photo1, 1),
        mediaPart('photo', photo2, 2),
        mediaPart('photo', photo3, 10),
      ],
    }

    expect(labels(many)).toEqual(['Tout le projet', 'La 1re photo', 'La 2e photo', 'La 10e photo'])
  })

  it('names the whole of each kind of content', () => {
    expect(labels(previewOf('update', [textPart('text')]))[0]).toBe('Toute la mise à jour')
    expect(labels(previewOf('member', [textPart('name')]))[0]).toBe('Tout le profil')
    expect(labels(previewOf('call', [mediaPart('photo', photo1, 1)]))[0]).toBe(
      fr.t(($) => $.report.whole.call),
    )
    expect(labels(previewOf('message', [mediaPart('photo', photo1, 1)]))[0]).toBe('Tout le message')
  })

  it('names the parts of an update and of a profile', () => {
    expect(
      labels(previewOf('update', [textPart('text'), mediaPart('photo', photo2, 2)])).slice(1),
    ).toEqual(['Ce qui a changé', 'La 2e photo'])
    expect(
      labels(
        previewOf('member', [
          textPart('name'),
          textPart('handle'),
          textPart('bio'),
          textPart('favoriteTools'),
          textPart('avatar'),
        ]),
      ).slice(1),
    ).toEqual(['Le nom', 'Le pseudo', 'La bio', 'Les outils favoris', 'La photo de profil'])
  })

  it('names the only image of a message « La capture », and of a call « La photo »', () => {
    expect(labels(previewOf('message', [mediaPart('photo', photo1, 1)]))[1]).toBe('La capture')
    expect(labels(previewOf('call', [mediaPart('photo', photo1, 1)]))[1]).toBe('La photo')
  })

  it('offers no choice for a comment, which is reported whole', () => {
    // Témoin : une mise à jour, elle, a des choix.
    expect(partChoices(previewOf('update', [textPart('text')]), t)).toHaveLength(2)
    expect(partChoices(previewOf('comment', []), t)).toEqual([])
  })
})

// --- Le nom d'une partie ---

describe('partLabel', () => {
  it('names a photo by its rank in the preview', () => {
    expect(partLabel({ field: 'photo', mediaId: photo2 }, meteo, t)).toBe('La 2e photo')
    expect(partLabel({ field: 'photo', mediaId: photo1 }, meteo, t)).toBe('La 1re photo')
  })

  it('names the description of a photo by the rank of its photo', () => {
    expect(partLabel({ field: 'photoDescription', mediaId: photo2 }, meteo, t)).toBe(
      'La description de la 2e photo',
    )
  })

  it('names a part without photo by its field', () => {
    expect(partLabel({ field: 'demoUrl' }, meteo, t)).toBe('Le lien de la démo')
    expect(partLabel({ field: 'cover', mediaId: photo1 }, meteo, t)).toBe('La couverture')
  })

  it('names the capture of a message', () => {
    const message = previewOf('message', [mediaPart('photo', photo3, 1)])

    expect(partLabel({ field: 'photo', mediaId: photo3 }, message, t)).toBe('La capture')
  })
})
