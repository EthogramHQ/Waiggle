// Tests du défi de la semaine sur la page d'une ruche (R19, docs/scenarios/refonte.md, « Les
// défis » ; planche R19-Ruche, options a14 et b13). Une ruche de 3 membres au moins reçoit chaque
// lundi un défi commun ; ses membres voient l'avancée (« 3 sur 5 ») sans dire qui n'a rien fait.
// La page le lit dans `HivePage.challenge` (null pour une ruche de moins de 3 membres) : une carte
// « Défi de la semaine » (titre de niveau 2, `ChallengeCard`), en tête du contenu sur téléphone, en
// tête de la colonne latérale sur ordinateur ; rien du tout sans défi.
//
// Le faux serveur des ruches (Hives.testkit.tsx) rend la page ; chaque test y pose son défi.
import type { HiveChallenge, HivePage } from '@ruche/contracts'
import { screen, waitFor, within } from '@testing-library/react-native'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { HiveScreen } from './HiveScreen'
import {
  T as HIVE,
  hiveId,
  hiveServer,
  lea,
  memberPage,
  resetHiveMocks,
  shown,
} from './Hives.testkit'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => true,
}))
// Les colonnes de la page (ordinateur), telles quelles, chacune dans une vue marquée de sa place
// (`side`, `main`, `aside`), comme HiveScreen.test.tsx : une colonne n'a ni rôle ni nom.
jest.mock('../ui/Columns', () => {
  const actual = jest.requireActual('../ui/Columns')
  const { createElement } = require('react')
  const { View } = require('react-native')
  const slot = (place: string, content: unknown) =>
    content === undefined || content === null
      ? content
      : createElement(View, { testID: `columns-${place}` }, content)
  return {
    ...actual,
    Columns: (props: Record<string, unknown>) =>
      createElement(
        actual.Columns,
        props.rows === undefined
          ? {
              ...props,
              side: slot('side', props.side),
              main: slot('main', props.main),
              aside: slot('aside', props.aside),
            }
          : props,
      ),
  }
})

// Les textes attendus, tirés des mêmes traductions que l'écran.
const T = {
  title: fr.t(($) => $.game.challenges.hiveTitle),
  feedback5: fr.t(($) => $.game.challenges.hive.feedback_5),
  isNew: fr.t(($) => $.game.new),
  done: fr.t(($) => $.game.harvest.challenge.done),
  progress: (progress: number, target: number) =>
    fr.t(($) => $.game.harvest.challenge.progress, { progress, target }),
}

/** Le défi de Famille cette semaine : « 5 retours entre vous », 3 déjà faits. */
const challenge: HiveChallenge = {
  hiveId,
  code: 'feedback_5',
  progress: 3,
  target: 5,
  done: false,
  isNew: false,
}

/** Famille (4 membres) avec ce défi. */
const withChallenge = (over: Partial<HiveChallenge> = {}): HivePage => ({
  ...memberPage,
  challenge: { ...challenge, ...over },
})

/** Ouvre la page de Famille et attend son contenu. */
const openHive = async (page: HivePage) => {
  hiveServer.pages.set(hiveId, page)
  const view = await renderWithProviders(
    <ToastProvider>
      <HiveScreen id={hiveId} />
    </ToastProvider>,
  )
  await waitFor(() => expect(shown(HIVE.tabsLabel) || shown(HIVE.activityTab)).toBe(true))
  return view
}

/** Le titre de la carte, un titre de niveau 2. */
const cardTitle = () => screen.queryByRole('header', { name: T.title })

beforeEach(() => {
  resetHiveMocks(`/hives/${hiveId}`, { id: hiveId })
  mockSession({ user: { id: lea.id, name: lea.name } })
})

describe('the challenge of the week on a hive page', () => {
  it('shows the card « Défi de la semaine » with its progress read « 3 sur 5 »', async () => {
    await openHive(withChallenge())

    const title = await waitFor(() => {
      const found = cardTitle()
      expect(found).toBeTruthy()
      return found
    })
    expect(title?.props['aria-level'] ?? title?.props.accessibilityLevel).toBe(2)
    expect(screen.getByText(T.feedback5)).toBeTruthy()
    const gauges = screen.getAllByRole('progressbar')
    expect(gauges.map((gauge) => gauge.props['aria-valuetext'])).toContain(T.progress(3, 5))
  })

  // Option a14 : un défi neuf (aucun geste encore) dit « Nouveau », jamais « 0 sur 5 ».
  it('says « Nouveau » for a new challenge, never « 0 sur 5 »', async () => {
    await openHive(withChallenge({ progress: 0, isNew: true }))

    await waitFor(() => expect(cardTitle()).toBeTruthy())
    expect(screen.getByText(T.isNew)).toBeTruthy()
    expect(screen.queryByText(T.progress(0, 5))).toBeNull()
    for (const gauge of screen.queryAllByRole('progressbar')) {
      expect(gauge.props['aria-valuetext']).not.toBe(T.progress(0, 5))
    }
  })

  it('says when the hive has succeeded', async () => {
    await openHive(withChallenge({ progress: 5, done: true }))

    await waitFor(() => expect(cardTitle()).toBeTruthy())
    expect(screen.getByText(T.done)).toBeTruthy()
  })

  // Le scénario : l'avancée, « sans dire qui n'a rien fait ». La carte ne nomme aucun membre.
  it('names no member on the card', async () => {
    await openHive(withChallenge())

    const title = await waitFor(() => {
      const found = cardTitle()
      expect(found).toBeTruthy()
      return found
    })
    // On remonte du titre jusqu'à la carte (le premier ensemble qui contient aussi la jauge).
    let card = title?.parent ?? null
    while (card && within(card).queryAllByRole('progressbar').length === 0) card = card.parent
    if (!card) throw new Error('no card around the title')
    for (const name of ['Léa', 'Papi Jean', 'Odile', 'Biscotte']) {
      expect(within(card).queryByText(new RegExp(name))).toBeNull()
    }
  })

  // Une ruche de moins de 3 membres n'a pas de défi : `challenge: null`, rien sur la page.
  it('shows no challenge card for a hive without a challenge', async () => {
    await openHive({ ...memberPage, challenge: null })

    // Témoin : la page est arrivée (ses onglets sont là).
    expect(shown(HIVE.activityTab)).toBe(true)
    expect(cardTitle()).toBeNull()
    expect(screen.queryByText(T.feedback5)).toBeNull()
  })

  // Témoin du test du dessus : la même page, avec un défi, a bien sa carte.
  it('shows the card on the same page once it has a challenge', async () => {
    await openHive(withChallenge())

    await waitFor(() => expect(cardTitle()).toBeTruthy())
  })

  it('puts the card in a side column on a computer, not in the main column', async () => {
    setDesktopWindow()
    await openHive(withChallenge())

    await waitFor(() => expect(cardTitle()).toBeTruthy())
    const inSlot = (place: string) => {
      const slot = screen.queryByTestId(`columns-${place}`)
      return slot ? within(slot).queryAllByRole('header', { name: T.title }).length > 0 : false
    }
    expect(inSlot('side') || inSlot('aside')).toBe(true)
    expect(inSlot('main')).toBe(false)
  })
})
