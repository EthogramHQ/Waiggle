// Tests de la fenêtre « Retirer » (R9, 7d ; planches R9-Retirer, R9-Moderation-Detail-Telephone).
// Scénario « Retirer une partie » : Louis, administrateur, devant le signalement de la 2e photo de
// « Météo », choisit « Retirer » ; une fenêtre s'ouvre : « Seulement cette partie » (choisi
// d'avance) ou « Tout le projet », le fondement (la loi ou les règles), et l'explication, « Montrée
// à Inès ». Il confirme : la photo est retirée, le reste du projet reste affiché.
//
// L'interface attendue (fixée au découpage du plan) :
// - `src/moderation/RemoveSheet.tsx` exporte `RemoveSheet`, de props
//   `{ item: ModerationQueueItem | RemovedItem; open: boolean; onClose: () => void; onDone: () => void }` ;
// - elle décide par `useDecide().decide(input)` (`src/moderation/api.ts`), qui rend un `ApiResult` ;
//   `onDone` après une décision réussie ;
// - « Que retirer ? » : deux choix (rôle `radio`), « Seulement cette partie : la photo 2 »
//   (`moderation.removeSheet.onlyPart`), coché d'avance, et « Tout le projet »
//   (`removeSheet.whole.<sorte>`) ; une partie qui ne se retire pas seule (REMOVABLE_PARTS : le
//   titre, le pitch, le texte d'une mise à jour) n'offre que le contenu entier ; un profil ne se
//   retire jamais entier (il se suspend) ;
// - le fondement « en menu » : un bouton dont le nom commence par « Fondement »
//   (`moderation.groundLabel`) ouvre un menu de choix (`ActionMenu`, rôle `choiceRole()`) ;
// - l'explication (`moderation.explanation`), « Montrée à Inès Haddad » (`removeSheet.shownTo`) ;
// - le mot de passe, seulement si l'API répond `password_required` (plus de 10 retraits dans
//   l'heure), confirmé par « Confirmer » (`moderation.password.confirm`) ;
// - `guardTaps` : les boutons de la feuille ignorent une tape dans les 600 ms qui suivent
//   l'ouverture (elle s'ouvre sous le doigt de « Retirer »).
import {
  MODERATION_DECISIONS_PER_DAY,
  type ModerationQueueItem,
  REMOVALS_BEFORE_PASSWORD,
  type RemovalGround,
  SUSPENSIONS_BEFORE_PASSWORD,
} from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { scamCommentItem } from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { choiceRole, containing, fr } from '../testing/text'
import { useDecide } from './api'
import { RemoveSheet } from './RemoveSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les miniatures de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('./api', () => ({ useDecide: jest.fn() }))

const mockDecide = jest.fn()
const decided = { ok: true, data: { id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' } }

const meteoId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
const photoId = '2b3c4d5e-6f70-4a81-9b2c-3d4e5f607182'

/** Un élément de la file, complet (R9) : la cible, sa partie, son projet, la fiche de l'autrice. */
const itemOf = (overrides: Partial<ModerationQueueItem>): ModerationQueueItem => ({
  ...scamCommentItem,
  context: { projectId: meteoId, title: 'Météo', image: null },
  contentCreatedAt: '2026-10-01T08:00:00.000Z',
  authorRecord: {
    memberId: 'u9',
    name: 'Inès Haddad',
    handle: 'ines_haddad',
    joinedAt: '2026-09-02T08:00:00.000Z',
    projectCount: 3,
    commentCount: 18,
    removals: 2,
    suspensions: 1,
    suspendedNow: false,
    canSuspend: true,
  },
  part: null,
  ...overrides,
})

/** La 2e photo de « Météo », le projet d'Inès, signalée deux fois. */
const secondPhotoItem = itemOf({
  target: { kind: 'project', id: meteoId },
  projectId: meteoId,
  part: { field: 'photo', mediaId: photoId, position: 2 },
  snapshot: [],
  images: [{ field: 'photo', state: 'present' }],
  reasons: [{ reason: 'privacy', count: 2 }],
  details: ['On me reconnaît sur mon balcon. Je n’ai jamais donné mon accord.'],
  count: 2,
})
/** La description de « Météo » : une partie sans photo. */
const descriptionItem = itemOf({
  target: { kind: 'project', id: meteoId },
  projectId: meteoId,
  part: { field: 'description', mediaId: null, position: null },
  snapshot: [{ field: 'description', value: 'Gagne 500 € par jour sans rien faire.' }],
})
/** Le titre de « Météo » : il ne se retire pas seul (REMOVABLE_PARTS). */
const titleItem = itemOf({
  target: { kind: 'project', id: meteoId },
  projectId: meteoId,
  part: { field: 'title', mediaId: null, position: null },
  snapshot: [{ field: 'title', value: 'Météo' }],
})
/** La bio d'un profil : un profil ne se retire jamais entier. */
const bioItem = itemOf({
  target: { kind: 'member', id: 'u9' },
  projectId: null,
  context: null,
  part: { field: 'bio', mediaId: null, position: null },
  snapshot: [{ field: 'bio', value: 'Écris-moi pour des gains rapides.' }],
})
/** Un commentaire, signalé en entier : il n'a pas de partie. */
const commentItem = itemOf({ part: null })

const explanation = 'Une personne reconnaissable sur son balcon, sans son accord.'
const T = {
  onlyPart: (n: number) =>
    fr.t(($) => $.moderation.removeSheet.onlyPart, {
      part: fr.t(($) => $.moderation.parts.photo, { n }),
    }),
  wholeProject: fr.t(($) => $.moderation.removeSheet.whole.project),
  explanation: fr.t(($) => $.moderation.explanation),
  password: fr.t(($) => $.moderation.password.label),
  confirmPassword: fr.t(($) => $.moderation.password.confirm),
  cancel: fr.t(($) => $.moderation.cancel),
}

const onClose = jest.fn()
const onDone = jest.fn()

beforeEach(() => {
  mockDecide.mockReset().mockResolvedValue(decided)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: mockDecide } as unknown as ReturnType<typeof useDecide>)
  onClose.mockReset()
  onDone.mockReset()
})

/** Ouvre la fenêtre sur cet élément, et attend la fin de sa garde des tapes. */
const openSheet = async (item: ModerationQueueItem = secondPhotoItem) => {
  await renderWithProviders(<RemoveSheet item={item} open onClose={onClose} onDone={onDone} />)
  await screen.findByLabelText(T.explanation)
  await passTapGuard()
}

/** Le bouton qui confirme : « Retirer la photo 2 », « Retirer », ou « Confirmer » (mot de passe). */
const confirmButton = () => {
  const names = [
    fr.t(($) => $.moderation.removeSheet.confirmPart, {
      part: fr.t(($) => $.moderation.parts.photo, { n: 2 }),
    }),
    fr.t(($) => $.moderation.confirmRemove),
  ]
  for (const name of names) {
    const button = screen.queryByRole('button', { name: containing(name) })
    if (button) return button
  }
  throw new Error('no confirmation button')
}

/** Choisit le fondement dans son menu. */
const chooseGround = async (ground: RemovalGround) => {
  await fireEvent.press(
    screen.getByRole('button', { name: new RegExp(`^${fr.t(($) => $.moderation.groundLabel)}`) }),
  )
  await fireEvent.press(
    await screen.findByRole(choiceRole(), {
      name: containing(fr.t(($) => $.moderation.grounds[ground])),
    }),
  )
}

/** Choisit le fondement, écrit l'explication, et confirme. */
const fillAndConfirm = async (ground: RemovalGround = 'illegal') => {
  await chooseGround(ground)
  await fireEvent.changeText(screen.getByLabelText(T.explanation), explanation)
  await fireEvent.press(confirmButton())
}

describe('removing a part', () => {
  it('names the part and the content in its title', async () => {
    await openSheet()

    const title = fr.t(($) => $.moderation.removeSheet.title, {
      part: fr.t(($) => $.moderation.parts.photo, { n: 2 }),
      title: 'Météo',
    })
    expect(screen.getByRole('header', { name: containing(title) })).toBeTruthy()
  })

  it('offers « Only this part » chosen beforehand, and « The whole project »', async () => {
    await openSheet()

    const only = screen.getByRole('radio', { name: containing(T.onlyPart(2)) })
    const whole = screen.getByRole('radio', { name: containing(T.wholeProject) })
    expect(only).toBeChecked()
    expect(whole).not.toBeChecked()
    // Ce qui reste affiché, sous le choix de la partie.
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.removeSheet.rest.project))),
    ).toBeTruthy()
  })

  it('says the explanation is shown to the author, by her name', async () => {
    await openSheet()

    expect(
      screen.getByText(
        containing(fr.t(($) => $.moderation.removeSheet.shownTo, { name: 'Inès Haddad' })),
      ),
    ).toBeTruthy()
  })

  it('removes only the 2nd photo, with its photo, the ground and the explanation, then says it is done', async () => {
    await openSheet()

    await fillAndConfirm('illegal')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide).toHaveBeenCalledWith({
      action: 'remove',
      target: { kind: 'project', id: meteoId },
      part: { field: 'photo', mediaId: photoId },
      ground: 'illegal',
      explanation,
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('sends the ground chosen in the menu: the rules', async () => {
    await openSheet()

    await fillAndConfirm('rules')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide.mock.calls[0]?.[0]).toMatchObject({ ground: 'rules' })
  })

  it('removes the whole project when « The whole project » is chosen, without any part', async () => {
    await openSheet()

    await fireEvent.press(screen.getByRole('radio', { name: containing(T.wholeProject) }))
    await fillAndConfirm('rules')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    const sent = mockDecide.mock.calls[0]?.[0]
    expect(sent).toEqual({
      action: 'remove',
      target: { kind: 'project', id: meteoId },
      ground: 'rules',
      explanation,
    })
    expect(sent).not.toHaveProperty('part')
  })

  it('sends a part without photo as the API expects it, without any mediaId', async () => {
    // `ReportPart` est strict : `mediaId: null` ferait refuser la décision (400).
    await openSheet(descriptionItem)

    await fillAndConfirm('rules')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    const sent = mockDecide.mock.calls[0]?.[0]
    expect(sent).toMatchObject({ part: { field: 'description' } })
    expect(sent.part).not.toHaveProperty('mediaId')
  })

  it('offers only the whole project for a title, which is never removed alone', async () => {
    await openSheet(titleItem)

    expect(screen.getByLabelText(T.explanation)).toBeTruthy() // témoin
    expect(screen.queryByRole('radio', { name: /^Seulement/ })).toBeNull()
    await fillAndConfirm('rules')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide.mock.calls[0]?.[0]).not.toHaveProperty('part')
    expect(mockDecide.mock.calls[0]?.[0]).toMatchObject({
      action: 'remove',
      target: { kind: 'project', id: meteoId },
    })
  })

  it('never offers to remove a whole profile, only its part', async () => {
    await openSheet(bioItem)

    expect(screen.getByLabelText(T.explanation)).toBeTruthy() // témoin
    // Aucun choix « Tout… » : un profil entier ne se retire pas, il se suspend.
    expect(screen.queryByRole('radio', { name: /^Tout/ })).toBeNull()
    await fillAndConfirm('rules')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide.mock.calls[0]?.[0]).toMatchObject({
      target: { kind: 'member', id: 'u9' },
      part: { field: 'bio' },
    })
  })

  it('removes a whole comment, which has no part to choose', async () => {
    await openSheet(commentItem)

    expect(screen.getByLabelText(T.explanation)).toBeTruthy() // témoin
    expect(screen.queryByRole('radio', { name: /^Seulement/ })).toBeNull()
    await fillAndConfirm('rules')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    const sent = mockDecide.mock.calls[0]?.[0]
    expect(sent).toMatchObject({ action: 'remove', target: scamCommentItem.target })
    expect(sent).not.toHaveProperty('part')
  })
})

describe('what stops a removal', () => {
  it('removes nothing without an explanation', async () => {
    await openSheet()

    await chooseGround('illegal')
    await fireEvent.changeText(screen.getByLabelText(T.explanation), '   ')
    await fireEvent.press(confirmButton())

    expect(mockDecide).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('ignores a tap on the confirmation right after opening (guardTaps)', async () => {
    // La fenêtre s'ouvre sous le doigt qui a touché « Retirer » : une tape dans les 600 ms qui
    // suivent est une double tape, pas une décision.
    await renderWithProviders(
      <RemoveSheet item={descriptionItem} open onClose={onClose} onDone={onDone} />,
    )
    await fireEvent.changeText(await screen.findByLabelText(T.explanation), explanation)
    await chooseGround('rules')
    await fireEvent.press(confirmButton())

    expect(mockDecide).not.toHaveBeenCalled()
    // Après la garde, la même tape décide.
    await passTapGuard()
    await fireEvent.press(confirmButton())
    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
  })

  it('sends a single removal for a double tap', async () => {
    // La réponse reste en attente : le second appui arrive pendant l'envoi (charte, 7b).
    mockDecide.mockReturnValue(new Promise(() => {}))
    await openSheet()

    await fillAndConfirm('illegal')
    await fireEvent.press(confirmButton())

    expect(mockDecide).toHaveBeenCalledTimes(1)
  })

  it('says the daily limit of decisions on 429 (J15), and stays open', async () => {
    mockDecide.mockResolvedValue({ ok: false, error: 'rateLimited' })
    await openSheet()

    await fillAndConfirm('illegal')

    expect(
      await screen.findByText(
        containing(fr.t(($) => $.moderation.limited, { max: MODERATION_DECISIONS_PER_DAY })),
      ),
    ).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('says why the API refuses a part that no open report targets', async () => {
    mockDecide.mockResolvedValue({ ok: false, error: 'partNotReported' })
    await openSheet()

    await fillAndConfirm('illegal')

    expect(await screen.findByText(containing(fr.t(($) => $.errors.partNotReported)))).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('closes on « Annuler » without deciding anything', async () => {
    await openSheet()

    await fireEvent.press(screen.getByRole('button', { name: T.cancel }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('shows nothing while closed', async () => {
    await renderWithProviders(
      <RemoveSheet item={secondPhotoItem} open={false} onClose={onClose} onDone={onDone} />,
    )

    expect(screen.queryByLabelText(T.explanation)).toBeNull()
    expect(screen.queryByRole('radio', { name: containing(T.onlyPart(2)) })).toBeNull()
  })
})

describe('the password asked again', () => {
  it('asks no password before the API requires it', async () => {
    await openSheet()

    expect(confirmButton()).toBeTruthy() // témoin
    expect(screen.queryByLabelText(T.password)).toBeNull()
  })

  it('asks the password after 10 removals in the hour, then sends it with the same removal', async () => {
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce(decided)
    await openSheet()
    await fillAndConfirm('illegal')

    const field = await screen.findByLabelText(T.password)
    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.moderation.password.hint, {
            suspensions: SUSPENSIONS_BEFORE_PASSWORD,
            removals: REMOVALS_BEFORE_PASSWORD,
          }),
        ),
      ),
    ).toBeTruthy()
    await fireEvent.changeText(field, 'mot-de-passe-de-louis')
    await fireEvent.press(screen.getByRole('button', { name: T.confirmPassword }))

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(2))
    expect(mockDecide).toHaveBeenLastCalledWith({
      action: 'remove',
      target: { kind: 'project', id: meteoId },
      part: { field: 'photo', mediaId: photoId },
      ground: 'illegal',
      explanation,
      password: 'mot-de-passe-de-louis',
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('says a wrong password, and keeps the field to try again', async () => {
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce({ ok: false, error: 'wrongPassword' })
    await openSheet()
    await fillAndConfirm('illegal')

    await fireEvent.changeText(await screen.findByLabelText(T.password), 'pas-le-bon')
    await fireEvent.press(screen.getByRole('button', { name: T.confirmPassword }))

    expect(await screen.findByText(containing(fr.t(($) => $.errors.wrongPassword)))).toBeTruthy()
    expect(screen.getByLabelText(T.password)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})

// R9, relecture : la feuille rappelle le contenu visé (comme la fenêtre de 7a), et dit du contenu
// entier qu'« on ne le verra plus », non « cette partie ».
describe('recalling the content to remove', () => {
  const commentKind = fr.t(($) => $.moderation.kinds.comment)
  const commentText = scamCommentItem.snapshot[0]?.value ?? ''

  it('recalls the kind and the text of a comment, in three lines at most', async () => {
    await openSheet(scamCommentItem)

    expect(screen.getByText(commentKind)).toBeTruthy()
    expect(screen.getByText(commentText).props.numberOfLines).toBe(3)
  })

  it('recalls the text of the part, not the title of the project', async () => {
    await openSheet(descriptionItem)

    expect(screen.getByText('Gagne 500 € par jour sans rien faire.')).toBeTruthy()
  })

  it('shows the picture of a tester’s message instead of a text', async () => {
    const url = 'https://api.example.test/media/capture.webp'
    await openSheet(
      itemOf({
        target: { kind: 'message', id: 'a1b2c3d4-0000-4000-8000-000000000001' },
        part: null,
        snapshot: [],
        images: [{ field: 'photo', state: 'present', url }],
      }),
    )

    expect(screen.getByRole('image', { name: fr.t(($) => $.moderation.images.photo) })).toBeTruthy()
  })

  it('says the whole content will not be seen anymore, without « cette partie »', async () => {
    await openSheet(scamCommentItem)

    expect(screen.getByText(containing(fr.t(($) => $.moderation.removeMessage)))).toBeTruthy()
    expect(screen.queryByText(containing('cette partie'))).toBeNull()
  })

  it('says « cette partie » while only a part is removed, and the whole content once chosen', async () => {
    await openSheet()

    const partMessage = fr.t(($) => $.moderation.removeSheet.message)
    expect(screen.getByText(containing(partMessage))).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: containing(T.wholeProject) }))

    expect(screen.getByText(containing(fr.t(($) => $.moderation.removeMessage)))).toBeTruthy()
    expect(screen.queryByText(containing(partMessage))).toBeNull()
  })
})
