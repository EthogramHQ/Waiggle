// Tests de la feuille « Créer une ruche » (R10, docs/scenarios/refonte.md, « Créer une ruche »,
// planche R10-Creer) : le nom (40 caractères au plus) et l'une des douze icônes, l'aperçu « Ma ruche
// Famille », « Créer » qui ouvre la page de la ruche à la place de la feuille, le nom vide refusé
// sous le champ, la double tape, et les sorties : Annuler et Échap ferment sans question (le nom est
// perdu), rien ne ferme la feuille pendant la création, pas même le Retour du navigateur.
//
// Ce que ces tests supposent de l'écran (plan R10, UI-C3, « Ce qui change au plan » 15 ; à corriger
// si le code en décide autrement) : `HiveCreateSheet()`, monté par `app/hives/new.tsx`, ouvert par
// `useRouteSheet` (repli `/hives`) ; `busy` et `useLeaveGuard` pendant la création (modèle
// `SuspendSheet`) ; POST /v1/hives `{ name, icon }`, puis `router.replace('/hives/<id>')`. Le reste
// est dans `Hives.testkit.tsx`.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { HiveCreateSheet } from './HiveCreateSheet'
import {
  badge,
  createdId,
  departures,
  heldReply,
  hiveServer,
  iconName,
  lea,
  myHiveNamed,
  navigatorRemoves,
  pressEscape,
  pushed,
  refusal,
  replaced,
  resetHiveMocks,
  shown,
  T,
} from './Hives.testkit'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHiveMocks('/hives/new')
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

const CREATE = /^\/v1\/hives$/
const created = () => hiveServer.received('POST', CREATE).map((one) => one.body)

/** Ouvre la feuille et attend son champ, puis la fin de la garde des tapes. */
const openSheet = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <HiveCreateSheet />
    </ToastProvider>,
  )
  await screen.findByLabelText(containing(T.nameField))
  await passTapGuard()
  return view
}

const field = () => screen.getByLabelText(containing(T.nameField))
const write = (text: string) => fireEvent.changeText(field(), text)
const submit = () => fireEvent.press(screen.getByRole('button', { name: T.submit }))
const cancel = () => fireEvent.press(screen.getByRole('button', { name: T.cancel }))
const sheetShown = () => screen.queryAllByText(containing(T.sheetTitle)).length > 0

// --- Ce que la feuille montre ---

describe('the sheet « Créer une ruche »', () => {
  it('asks for the name of the hive, at most 40 characters, and one icon out of twelve', async () => {
    await openSheet()

    expect(screen.getByRole('header', { name: T.sheetTitle })).toBeTruthy()
    expect(field().props.maxLength ?? 40).toBeLessThanOrEqual(40)
    expect(screen.getByLabelText(T.iconGroup)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(12)
    expect(screen.getByRole('radio', { name: iconName('coffee') })).toBeTruthy()
  })

  it('reads the preview as Ruche Famille as the name is typed, without « Ma ruche »', async () => {
    await openSheet()

    await write('Famille')

    // R11 (« Moins de mots », U4) : « Ma ruche » quitte l'aperçu (texte en clair : sa clé disparaîtra).
    expect(screen.queryByText('Ma ruche')).toBeNull()
    expect(myHiveNamed('Famille')).toBe('Ruche Famille')
    expect(shown(myHiveNamed('Famille'))).toBe(true)
    expect(screen.getAllByLabelText(badge('Famille'))).not.toHaveLength(0)
  })
})

// --- Créer ---

describe('creating a hive', () => {
  it('sends the name and the icon chosen', async () => {
    await openSheet()
    await write('Famille')
    await fireEvent.press(screen.getByRole('radio', { name: iconName('coffee') }))

    await submit()

    await waitFor(() => expect(created()).toHaveLength(1))
    expect(created()[0]).toEqual({ name: 'Famille', icon: 'coffee' })
  })

  it('replaces the create sheet with the new hive page', async () => {
    await openSheet()
    await write('Famille')

    await submit()

    await waitFor(() => expect(replaced()).toContain(`/hives/${createdId}`))
    // Pas d'entrée d'historique qui ramènerait à la feuille.
    expect(pushed()).toEqual([])
  })

  it('refuses an empty name, or one made only of spaces, with a message under the field', async () => {
    await openSheet()

    await submit()
    expect(await screen.findAllByText(containing(T.nameRequired))).not.toHaveLength(0)

    await write('    ')
    await submit()
    expect(screen.getAllByText(containing(T.nameRequired))).not.toHaveLength(0)
    expect(created()).toEqual([])
    expect(departures()).toBe(0)
  })

  it('creates one hive on a double tap on « Créer »', async () => {
    const held = heldReply()
    hiveServer.answer('POST', CREATE, () => held.reply)
    await openSheet()
    await write('Famille')

    await submit()
    await submit()

    expect(created()).toHaveLength(1)
    await held.release(refusal(500, 'internal'))
  })

  it('says the hive could not be created, keeping the name', async () => {
    hiveServer.answer('POST', CREATE, () => refusal(500, 'internal'))
    await openSheet()
    await write('Famille')

    await submit()

    await waitFor(() => expect(shown(T.createError)).toBe(true))
    expect(field()).toHaveDisplayValue('Famille')
    expect(departures()).toBe(0)
  })
})

// --- Les sorties ---

describe('leaving the create sheet', () => {
  it('closes on « Annuler » without asking anything', async () => {
    await openSheet()
    await write('Famille')

    await cancel()

    expect(departures()).toBe(1)
    expect(screen.queryByRole('button', { name: T.discard })).toBeNull()
  })

  it('closes on Escape and loses the name without asking', async () => {
    await openSheet()
    await write('Famille')

    await pressEscape(T.sheetTitle)

    expect(departures()).toBe(1)
    expect(screen.queryByRole('button', { name: T.discard })).toBeNull()
    expect(created()).toEqual([])
  })

  it('lets the browser Back close the sheet before creating (témoin)', async () => {
    await openSheet()
    await write('Famille')

    const event = await navigatorRemoves()

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('keeps the create sheet open during creation, even on browser Back', async () => {
    const held = heldReply()
    hiveServer.answer('POST', CREATE, () => held.reply)
    await openSheet()
    await write('Famille')
    await submit()

    const event = await navigatorRemoves()
    await pressEscape(T.sheetTitle)
    await cancel()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(sheetShown()).toBe(true)
    expect(departures()).toBe(0)
    await held.release(refusal(500, 'internal'))
  })
})
