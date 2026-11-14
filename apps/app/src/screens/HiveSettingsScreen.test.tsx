// Tests des réglages d'une ruche, réservés à son animateur (R10, docs/scenarios/refonte.md,
// « L'animateur », planche R10-Reglages-Ruche) : le nom enregistré en quittant le champ ou par
// Entrée (option 1 des planches, sans « Enregistrer »), un nom vide refusé et gardé avec son message,
// l'icône, « Qui peut inviter ? » enregistré tout de suite et revenu à la valeur du serveur après
// deux échecs, « Confier l'animation » puis la page de la ruche à la place des réglages,
// « Supprimer la ruche » et sa fenêtre qui ne se ferme pas pendant la suppression.
//
// Ce que ces tests supposent de l'écran (plan R10, UI-C5, « Ce qui change au plan » 15 ; à corriger
// si le code en décide autrement) : `HiveSettingsScreen({ id })`, monté par
// `app/hives/[id]/settings.tsx` ; GET /v1/hives/<id> et …/members ; PATCH /v1/hives/<id> avec la
// seule partie changée ; POST …/animator `{ userId }` puis `router.replace('/hives/<id>')` ; DELETE
// /v1/hives/<id> puis l'onglet Ruches. Les fenêtres viennent de `hives/HiveDialogs`. Le reste est
// dans `Hives.testkit.tsx`.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { HiveSettingsScreen } from './HiveSettingsScreen'
import {
  animatorPage,
  anyControl,
  deleteBody,
  deleteTitle,
  departures,
  getControl,
  handOverTitle,
  heldReply,
  hiveId,
  hiveServer,
  iconName,
  ines,
  lea,
  membersLeaAnimator,
  pressEscape,
  pushed,
  refusal,
  replaced,
  resetHiveMocks,
  shown,
  T,
  visitedPaths,
} from './Hives.testkit'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHiveMocks(`/hives/${hiveId}/settings`, { id: hiveId })
  // Léa anime Famille.
  hiveServer.pages.set(hiveId, animatorPage)
  hiveServer.members.set(hiveId, membersLeaAnimator)
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

const HIVE = new RegExp(`^/v1/hives/${hiveId}$`)
const ANIMATOR = new RegExp(`^/v1/hives/${hiveId}/animator$`)
const patches = () => hiveServer.received('PATCH', HIVE).map((one) => one.body)

/** Ouvre les réglages et attend le champ du nom, rempli. */
const openSettings = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <HiveSettingsScreen id={hiveId} />
    </ToastProvider>,
  )
  await waitFor(() => expect(nameField()).toHaveDisplayValue('Famille'))
  return view
}

const nameField = () => screen.getByLabelText(T.settingsName)
const radio = (name: string) => screen.getByRole('radio', { name })
const isChecked = (name: string) => {
  const found = radio(name)
  return Boolean(found.props.accessibilityState?.checked ?? found.props['aria-checked'] ?? false)
}

/** Deux réponses tenues, puis lâchées ensemble en échec (deux changements vite, R8). */
const failBothPatches = () => {
  const held: ReturnType<typeof heldReply>[] = []
  hiveServer.answer('PATCH', HIVE, () => {
    const one = heldReply()
    held.push(one)
    return one.reply
  })
  return async () => {
    for (const one of held) await one.release(refusal(500, 'internal'))
  }
}

// --- Ce que la page montre ---

describe('the settings of a hive', () => {
  it('shows the name, the icon, « Qui peut inviter ? », « Confier l’animation » and « Supprimer la ruche »', async () => {
    await openSettings()

    expect(shown(T.settingsTitle)).toBe(true)
    expect(shown(T.policy)).toBe(true)
    expect(isChecked(T.policyMembers)).toBe(true)
    expect(isChecked(T.policyAnimator)).toBe(false)
    expect(anyControl(containing(T.handOver))).toBeTruthy()
    expect(getControl(T.deleteHive)).toBeTruthy()
  })

  it('refuses the settings to a member who does not animate the hive', async () => {
    resetHiveMocks(`/hives/${hiveId}/settings`, { id: hiveId })
    await renderWithProviders(<HiveSettingsScreen id={hiveId} />)

    await waitFor(() => expect(shown(T.notFound) || departures() > 0).toBe(true))
    expect(screen.queryByLabelText(T.settingsName)).toBeNull()
  })
})

// --- Le nom et l'icône ---

describe('the name and the icon', () => {
  it('saves the hive name when the field loses focus', async () => {
    await openSettings()

    await fireEvent.changeText(nameField(), 'La famille')
    expect(patches()).toEqual([])
    await fireEvent(nameField(), 'blur')

    await waitFor(() => expect(patches()).toEqual([{ name: 'La famille' }]))
  })

  it('saves the hive name on Enter', async () => {
    await openSettings()

    await fireEvent.changeText(nameField(), 'La famille')
    await fireEvent(nameField(), 'submitEditing')

    await waitFor(() => expect(patches()).toEqual([{ name: 'La famille' }]))
  })

  it('sends nothing when the name has not changed', async () => {
    await openSettings()

    await fireEvent(nameField(), 'blur')

    expect(patches()).toEqual([])
  })

  it('keeps an empty name in the field with its message, and sends nothing', async () => {
    await openSettings()

    await fireEvent.changeText(nameField(), '   ')
    await fireEvent(nameField(), 'blur')

    expect(await screen.findAllByText(containing(T.nameRequired))).not.toHaveLength(0)
    expect(nameField()).toHaveDisplayValue('   ')
    expect(patches()).toEqual([])
  })

  it('says the name could not be saved', async () => {
    hiveServer.answer('PATCH', HIVE, () => refusal(500, 'internal'))
    await openSettings()

    await fireEvent.changeText(nameField(), 'La famille')
    await fireEvent(nameField(), 'blur')

    await waitFor(() => expect(shown(T.nameError)).toBe(true))
  })

  it('changes the icon from « Changer l’icône »', async () => {
    await openSettings()

    await fireEvent.press(getControl(containing(T.changeIcon)))
    await fireEvent.press(await screen.findByRole('radio', { name: iconName('coffee') }))

    await waitFor(() => expect(patches()).toContainEqual({ icon: 'coffee' }))
  })
})

// --- Qui peut inviter ---

describe('who can invite', () => {
  it('saves « Seulement moi » at once, without « Enregistrer »', async () => {
    await openSettings()

    await fireEvent.press(radio(T.policyAnimator))

    await waitFor(() => expect(patches()).toEqual([{ invitePolicy: 'animator' }]))
    expect(isChecked(T.policyAnimator)).toBe(true)
  })

  it('ends on the server value after two failed policy changes', async () => {
    const release = failBothPatches()
    await openSettings()

    await fireEvent.press(radio(T.policyAnimator))
    await fireEvent.press(radio(T.policyMembers))
    await fireEvent.press(radio(T.policyAnimator))
    await release()

    await waitFor(() => expect(patches().length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(shown(T.policyError)).toBe(true))
    // Le serveur n'a rien enregistré : le choix finit sur « Tous les membres », sa valeur.
    await waitFor(() => expect(isChecked(T.policyMembers)).toBe(true))
    expect(isChecked(T.policyAnimator)).toBe(false)
  })
})

// --- Confier l'animation ---

describe('handing over the animation', () => {
  /** Ouvre « Confier l'animation », choisit Inès, et attend sa fenêtre. */
  const handOverToInes = async () => {
    const opener = anyControl(containing(T.handOver))
    if (opener) await fireEvent.press(opener)
    const choice = await waitFor(() => {
      const found = anyControl(containing(ines.name))
      if (!found) throw new Error('no member to choose')
      return found
    })
    await fireEvent.press(choice)
    await screen.findByRole('header', { name: handOverTitle(ines.name) })
    await passTapGuard()
  }

  it('asks before handing over, then sends the member chosen', async () => {
    await openSettings()
    await handOverToInes()
    expect(hiveServer.received('POST', ANIMATOR)).toEqual([])

    await fireEvent.press(screen.getByRole('button', { name: T.handOverConfirm }))

    await waitFor(() =>
      expect(hiveServer.received('POST', ANIMATOR).map((one) => one.body)).toEqual([
        { userId: ines.id },
      ]),
    )
  })

  it('replaces the settings with the hive page after « Confier »', async () => {
    await openSettings()
    await handOverToInes()

    await fireEvent.press(screen.getByRole('button', { name: T.handOverConfirm }))

    await waitFor(() => expect(replaced()).toContain(`/hives/${hiveId}`))
    expect(pushed()).toEqual([])
  })
})

// --- Supprimer la ruche ---

describe('deleting the hive', () => {
  const openDelete = async () => {
    await fireEvent.press(getControl(T.deleteHive))
    await screen.findByRole('header', { name: deleteTitle('Famille') })
    await passTapGuard()
  }

  it('says that its 5 reserved projects become private, and that it cannot be undone', async () => {
    await openSettings()
    await openDelete()

    expect(shown(deleteBody(5))).toBe(true)
    expect(hiveServer.received('DELETE', HIVE)).toEqual([])
  })

  it('deletes once on a double tap, then goes back to the hives tab', async () => {
    const held = heldReply()
    hiveServer.answer('DELETE', HIVE, () => held.reply)
    await openSettings()
    await openDelete()

    await fireEvent.press(screen.getByRole('button', { name: T.deleteConfirm }))
    await fireEvent.press(screen.getByRole('button', { name: T.deleteConfirm }))
    expect(hiveServer.received('DELETE', HIVE)).toHaveLength(1)

    await held.release({ status: 204 })
    await waitFor(() => expect(visitedPaths()).toContain('/hives'))
  })

  it('refuses Escape and « Annuler » while deleting', async () => {
    const held = heldReply()
    hiveServer.answer('DELETE', HIVE, () => held.reply)
    await openSettings()
    await openDelete()

    await fireEvent.press(screen.getByRole('button', { name: T.deleteConfirm }))
    await pressEscape(deleteTitle('Famille'))
    await fireEvent.press(screen.getByRole('button', { name: T.dialogCancel }))

    expect(screen.getByRole('header', { name: deleteTitle('Famille') })).toBeTruthy()
    await held.release(refusal(500, 'internal'))
    await act(async () => {})
  })

  it('closes on « Annuler » before deleting (témoin)', async () => {
    await openSettings()
    await openDelete()

    await fireEvent.press(screen.getByRole('button', { name: T.dialogCancel }))

    await waitFor(() =>
      expect(screen.queryByRole('header', { name: deleteTitle('Famille') })).toBeNull(),
    )
    expect(hiveServer.received('DELETE', HIVE)).toEqual([])
  })
})
