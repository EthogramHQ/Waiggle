// Tests de la page « Outils » de la Modération (tranche R6b, /moderation/tools ; scénario
// docs/scenarios/refonte.md, « Ranger les « Autre » »). Un administrateur y voit, onglet
// « À vérifier », les autres outils tapés par les membres (du plus récent au plus ancien, avec leurs
// projets visibles) et décide pour chacun : « Ajouter au catalogue » (un formulaire), « Rattacher à
// un outil » (choisir l'outil du catalogue, puis confirmer dans une fenêtre qui dit ce qui changera)
// ou « Laisser hors du catalogue ». Une carte décidée garde sa place, son résultat à la place de ses
// boutons, jusqu'au changement d'onglet. L'onglet « Catalogue » cherche, modifie et ajoute des
// outils. « Changements récents », en bas, dit qui a fait quoi. Pour tout autre visiteur, la page
// n'existe pas.
//
// L'écran attendu : `ModerationToolsScreen` (sans propriété), dans
// `src/screens/ModerationToolsScreen.tsx` ; ses cartes (`ui/PendingToolCard`, `ui/CatalogueChangeRow`)
// et sa feuille d'outil (`screens/ToolEditSheet`) ont leurs propres tests. Le réseau est remplacé
// au plus bas (`fetch`, voir `ModerationCatalogue.testkit.tsx`) : les vrais hooks tournent, et le
// test lit les demandes reçues.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, View } from 'react-native'
import { admitChange, makeComPending, mergeChange } from '../testing/catalogue'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  cardOf,
  catalogueServer,
  dialogTitled,
  heldReply,
  installCatalogueServer,
  layerOf,
  pressableIn,
  refusal,
  rowWithButton,
  scrimOf,
  shownInOrder,
  spokenName,
} from './ModerationCatalogue.testkit'
import { ModerationToolsScreen } from './ModerationToolsScreen'
import { lendContains, lendPage, watchFocus } from './ProjectComments.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La langue du téléphone en français : sur le web aussi, la page s'écrit en français.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
// `apiFetch` joint sur mobile le cookie gardé par Better Auth : ici, aucun.
jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue(null) },
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation/tools',
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: mockReplace,
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useNavigation: () => ({ addListener: () => () => {} }),
  useLocalSearchParams: () => ({}),
}))

// --- Les textes ---

const t = fr.t.bind(fr)
const TITLE = t(($) => $.moderation.catalogue.title)
const TAB_PENDING = t(($) => $.moderation.catalogue.tabPending)
const TAB_CATALOGUE = t(($) => $.moderation.catalogue.tabCatalogue)
const ADMIT = t(($) => $.moderation.catalogue.admit)
const MERGE = t(($) => $.moderation.catalogue.merge)
const DISMISS = t(($) => $.moderation.catalogue.dismiss)
const ADMITTED = t(($) => $.moderation.catalogue.admitted)
const DISMISSED = t(($) => $.moderation.catalogue.dismissed)
const ADMIT_TITLE = t(($) => $.moderation.catalogue.formAdmitTitle)
const CREATE_TITLE = t(($) => $.moderation.catalogue.formCreateTitle)
const NAME = t(($) => $.moderation.catalogue.name)
const DESCRIPTION_FR = t(($) => $.moderation.catalogue.descriptionFr)
const DESCRIPTION_EN = t(($) => $.moderation.catalogue.descriptionEn)
const SAVE = t(($) => $.moderation.catalogue.save)
const CANCEL = t(($) => $.moderation.catalogue.cancel)
const CLOSE = t(($) => $.common.close)
const ABANDON = t(($) => $.common.discardTitle)
const KEEP_EDITING = t(($) => $.common.keepEditing)
const MERGE_SEARCH = t(($) => $.moderation.catalogue.mergeSearch)
const MERGE_ACTION = t(($) => $.moderation.catalogue.mergeAction)
const CHANGES = t(($) => $.moderation.catalogue.changes)
const CREATION = t(($) => $.tools.family.creation)
const NOT_FOUND_WAY_OUT = 'Retour à l’accueil'
const mergeTitle = (name: string) => t(($) => $.moderation.catalogue.mergeTitle, { name })
/** « Cité par 3 projets » : ce qui distingue une carte d'« Autre » du reste de la page. */
const CITED = /^Cité par \d+ projets?$/

const FR_TEXT = 'Entraîne un modèle d’image dans le navigateur, sans code.'
const EN_TEXT = 'Trains an image model in the browser, without code.'

// --- Aides ---

const probe = createRef<View>()

/** Ouvre la page, en attendant les autres outils (le témoin de chaque test). */
const openTools = async () => {
  await renderWithProviders(
    <>
      <View ref={probe} />
      <ModerationToolsScreen />
    </>,
  )
  await screen.findByText('Make.com')
}

/** La carte d'un autre outil, par son nom. */
const card = (name: string) => cardOf(name, CITED)

/** La feuille ouverte, retrouvée par son titre (elle en porte le nom). */
const sheet = (title: string) => within(screen.getByLabelText(title))

/** Ouvre « Ajouter au catalogue » sur la carte de « Teachable Machine ». */
const openAdmit = async () => {
  await openTools()
  await fireEvent.press(card('Teachable Machine').getByRole('button', { name: ADMIT }))
  await screen.findByLabelText(NAME)
}

/** Remplit ce qui manque au formulaire d'ajout : la famille et les deux descriptions. */
const fillAdmit = async () => {
  await fireEvent.press(screen.getByLabelText(CREATION))
  await fireEvent.changeText(screen.getByLabelText(DESCRIPTION_FR), FR_TEXT)
  await fireEvent.changeText(screen.getByLabelText(DESCRIPTION_EN), EN_TEXT)
}

/** Le formulaire d'ajout est-il ouvert ? Son champ « Nom » le dit. */
const formOpen = () => screen.queryByLabelText(NAME) !== null

/** Ouvre « Rattacher à un outil » sur la carte de « Make.com », et choisit « Make ». */
const openMergeAndChooseMake = async () => {
  await openTools()
  await fireEvent.press(card('Make.com').getByRole('button', { name: MERGE }))
  const field = await screen.findByRole('combobox', { name: MERGE_SEARCH })
  await fireEvent.changeText(field, 'Make')
  // « Make » du catalogue, pas « Make.com » (un autre outil, que « Rattacher » ne propose pas).
  await fireEvent.press(await screen.findByRole('option', { name: /^Make(?!\.)/ }))
}

/** Les « Autre » décidés par le test, et ce qu'il a écrit. */
const writes = () =>
  catalogueServer.sent.filter((one) => one.method !== 'GET').map((one) => one.path)

const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

beforeEach(() => {
  installCatalogueServer()
  mockSession({ user: { id: catalogueServer.me.id, name: catalogueServer.me.name } })
  for (const mock of [mockPush, mockNavigate, mockReplace]) mock.mockReset()
})

describe('who sees the tools page', () => {
  it('shows an administrator the other tools to review, newest first, with their projects', async () => {
    await openTools()

    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy()
    expect(screen.getByRole('radio', { name: TAB_PENDING, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: TAB_CATALOGUE, checked: false })).toBeTruthy()
    expect(shownInOrder(/^(Make\.com|Teachable Machine|Suno Studio)$/)).toEqual([
      'Make.com',
      'Teachable Machine',
      'Suno Studio',
    ])
    expect(card('Make.com').getByText('Cité par 3 projets')).toBeTruthy()
    expect(pressableIn(card('Make.com'), 'Le tri des factures, par Hugo Lefèvre')).toBeTruthy()
  })

  it('opens a project of a card', async () => {
    await openTools()

    await fireEvent.press(pressableIn(card('Make.com'), 'Le tri des factures, par Hugo Lefèvre'))

    const opened = [...mockPush.mock.calls, ...mockNavigate.mock.calls].map(([href]) =>
      pathOf(href),
    )
    expect(opened).toEqual([`/projects/${makeComPending.projects[0]?.id}`])
  })

  it('says « not found » to a member who is not an administrator, and shows none of the other tools', async () => {
    catalogueServer.me = leaMe
    mockSession({ user: { id: leaMe.id, name: leaMe.name } })
    await renderWithProviders(<ModerationToolsScreen />)

    expect(await screen.findByRole('button', { name: NOT_FOUND_WAY_OUT })).toBeTruthy()
    expect(screen.queryByText('Make.com')).toBeNull()
    expect(screen.queryByRole('radio', { name: TAB_PENDING })).toBeNull()
  })

  it('says « not found » when the API does not know the page (a revoked administrator)', async () => {
    // L'API refait la vérification à chaque demande : 404, comme une adresse qui n'existe pas.
    catalogueServer.answer('GET', /^\/v1\/moderation\//, () => refusal(404, 'not_found'))
    await renderWithProviders(<ModerationToolsScreen />)

    expect(await screen.findByRole('button', { name: NOT_FOUND_WAY_OUT })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('says when there is no other tool to review', async () => {
    catalogueServer.pending = []
    await renderWithProviders(<ModerationToolsScreen />)

    expect(
      await screen.findByText(containing(t(($) => $.moderation.catalogue.emptyPending))),
    ).toBeTruthy()
  })
})

describe('deciding on an other tool', () => {
  it('keeps a decided card in place, its result instead of its buttons, until the tab changes', async () => {
    await openTools()

    await fireEvent.press(card('Teachable Machine').getByRole('button', { name: DISMISS }))

    await waitFor(() => expect(card('Teachable Machine').getByText(DISMISSED)).toBeTruthy())
    expect(writes()).toEqual(['/v1/moderation/tools/teachable-machine/dismiss'])
    // L'API ne le liste plus ; la carte reste quand même à sa place, sans ses boutons.
    await act(async () => {})
    expect(shownInOrder(/^(Make\.com|Teachable Machine|Suno Studio)$/)).toEqual([
      'Make.com',
      'Teachable Machine',
      'Suno Studio',
    ])
    expect(card('Teachable Machine').queryByRole('button', { name: ADMIT })).toBeNull()
    expect(card('Teachable Machine').queryByRole('button', { name: DISMISS })).toBeNull()
    expect(card('Make.com').getByRole('button', { name: DISMISS })).toBeTruthy() // témoin

    // Un autre onglet, puis retour : la liste est celle de l'API, sans l'outil décidé.
    await fireEvent.press(screen.getByRole('radio', { name: TAB_CATALOGUE }))
    await fireEvent.press(screen.getByRole('radio', { name: TAB_PENDING }))
    await screen.findByText('Make.com')
    await waitFor(() => expect(screen.queryByText('Teachable Machine')).toBeNull())
  })

  it('admits an other tool with the filled form, and the card says it', async () => {
    await openAdmit()
    // Le titre de la feuille répète le libellé des boutons des cartes : on vise son en-tête.
    expect(screen.getByRole('header', { name: ADMIT_TITLE })).toBeTruthy()
    // Le nom est prérempli : celui que les membres ont tapé.
    expect(screen.getByLabelText(NAME)).toHaveDisplayValue('Teachable Machine')

    await fillAdmit()
    await fireEvent.press(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(formOpen()).toBe(false))
    const admitted = catalogueServer.received('POST', /\/admit$/)
    expect(admitted.map((one) => one.path)).toEqual([
      '/v1/moderation/tools/teachable-machine/admit',
    ])
    expect(admitted[0]?.body).toEqual({
      name: 'Teachable Machine',
      family: 'creation',
      descriptionFr: FR_TEXT,
      descriptionEn: EN_TEXT,
      siteUrl: null,
    })
    expect(card('Teachable Machine').getByText(ADMITTED)).toBeTruthy()
  })

  it('ignores a second tap 700 ms after « Ajouter au catalogue »', async () => {
    // Après 700 ms, la garde de double tape (600 ms) est passée : seul l'état de l'écriture (une
    // feuille déjà ouverte, un envoi en cours) empêche un second effet.
    const held = heldReply()
    catalogueServer.answer('POST', /\/admit$/, () => held.reply)
    await openTools()
    const admit = card('Teachable Machine').getByRole('button', { name: ADMIT })

    await fireEvent.press(admit)
    await pause(700)
    await fireEvent.press(admit)
    expect(screen.getAllByLabelText(NAME)).toHaveLength(1)

    await fillAdmit()
    const save = screen.getByRole('button', { name: SAVE })
    await fireEvent.press(save)
    await pause(700)
    await fireEvent.press(save)

    expect(catalogueServer.received('POST', /\/admit$/)).toHaveLength(1)
    await act(async () => held.release({ status: 200, body: {} }))
  })

  it('asks before dropping a modified form, and refuses to close while saving', async () => {
    await openAdmit()
    await fireEvent.changeText(screen.getByLabelText(NAME), 'Teachable Machine de Google')

    // Modifié : « Annuler » et Échap demandent d'abord ; « Continuer » garde ce qui est tapé.
    for (const close of [
      () => fireEvent.press(screen.getByRole('button', { name: CANCEL })),
      () => act(async () => layerOf(screen.getByLabelText(NAME)).props.onRequestClose()),
    ]) {
      await close()
      expect(screen.getAllByText(ABANDON).length).toBeGreaterThan(0)
      await passTapGuard()
      await fireEvent.press(screen.getByRole('button', { name: KEEP_EDITING }))
      expect(screen.getByLabelText(NAME)).toHaveDisplayValue('Teachable Machine de Google')
    }

    // Pendant l'écriture : ni Échap, ni « Annuler », ni « Fermer », ni le voile ne ferment.
    const held = heldReply()
    catalogueServer.answer('POST', /\/admit$/, () => held.reply)
    await fillAdmit()
    await fireEvent.press(screen.getByRole('button', { name: SAVE }))
    await act(async () => layerOf(screen.getByLabelText(NAME)).props.onRequestClose())
    await fireEvent.press(screen.getByRole('button', { name: CANCEL }))
    await fireEvent.press(
      within(layerOf(screen.getByLabelText(NAME))).getByRole('button', { name: CLOSE }),
    )
    await fireEvent.press(scrimOf(layerOf(screen.getByLabelText(NAME))))

    expect(formOpen()).toBe(true)
    expect(screen.queryByText(ABANDON)).toBeNull()
    expect(catalogueServer.received('POST', /\/admit$/)).toHaveLength(1)
    await act(async () => held.release({ status: 200, body: {} }))
  })

  it('reads a 409 tool_name_taken in the form, and keeps what was typed', async () => {
    catalogueServer.answer('POST', /\/admit$/, () => refusal(409, 'tool_name_taken'))
    await openAdmit()
    await fireEvent.changeText(screen.getByLabelText(NAME), 'Lovable')
    await fillAdmit()

    await fireEvent.press(screen.getByRole('button', { name: SAVE }))

    expect(await screen.findByText(containing(t(($) => $.errors.toolNameTaken)))).toBeTruthy()
    expect(formOpen()).toBe(true)
    expect(screen.getByLabelText(NAME)).toHaveDisplayValue('Lovable')
    // La carte n'est pas décidée.
    expect(screen.queryByText(ADMITTED)).toBeNull()
  })

  it('reads a 400 refusal of the API in the form', async () => {
    catalogueServer.answer('POST', /\/admit$/, () => refusal(400, 'validation'))
    await openAdmit()
    await fillAdmit()

    await fireEvent.press(screen.getByRole('button', { name: SAVE }))

    expect(await screen.findByText(containing(t(($) => $.errors.validation)))).toBeTruthy()
    expect(formOpen()).toBe(true)
  })

  it('keeps « Rattacher » disabled until a catalogue tool is chosen, and names both tools', async () => {
    await openTools()
    await fireEvent.press(card('Make.com').getByRole('button', { name: MERGE }))
    const merging = sheet(mergeTitle('Make.com'))

    expect(merging.getByRole('button', { name: MERGE_ACTION })).toBeDisabled()

    await fireEvent.changeText(merging.getByRole('combobox', { name: MERGE_SEARCH }), 'Make')
    await fireEvent.press(await screen.findByRole('option', { name: /^Make(?!\.)/ }))

    expect(merging.getByRole('button', { name: MERGE_ACTION })).toBeEnabled()
    // La feuille nomme l'autre outil (son titre) et l'outil choisi.
    expect(merging.getAllByText(/^Make$/).length).toBeGreaterThan(0)
    expect(writes()).toEqual([])
  })

  it('asks before linking, and says the link changes private projects and cannot be undone', async () => {
    await openMergeAndChooseMake()

    await fireEvent.press(sheet(mergeTitle('Make.com')).getByRole('button', { name: MERGE_ACTION }))

    const confirmTitle = t(($) => $.moderation.catalogue.mergeConfirmTitle, {
      name: 'Make.com',
      target: 'Make',
    })
    const dialog = dialogTitled(confirmTitle)
    const said = t(($) => $.moderation.catalogue.mergeConfirm, {
      name: 'Make.com',
      target: 'Make',
      projects: t(($) => $.moderation.catalogue.mergeProjects, { count: 3 }),
      profiles: t(($) => $.moderation.catalogue.mergeProfiles, { count: 1 }),
    })
    expect(dialog.getByText(containing(said))).toBeTruthy()
    expect(said).toMatch(/projets privés compris/)
    expect(said).toMatch(/ne s’annule pas/)
    // Les nombres viennent de l'API, projets privés compris.
    expect(catalogueServer.received('GET', /\/make-com\/impact$/)).toHaveLength(1)
    expect(catalogueServer.received('POST', /\/merge$/)).toHaveLength(0)

    await passTapGuard()
    await fireEvent.press(dialog.getByRole('button', { name: MERGE_ACTION }))

    await waitFor(() =>
      expect(
        card('Make.com').getByText(t(($) => $.moderation.catalogue.merged, { target: 'Make' })),
      ).toBeTruthy(),
    )
    const merged = catalogueServer.received('POST', /\/merge$/)
    expect(merged.map((one) => [one.path, one.body])).toEqual([
      ['/v1/moderation/tools/make-com/merge', { into: 'make' }],
    ])
  })

  it('links nothing when the confirmation is cancelled', async () => {
    await openMergeAndChooseMake()
    await fireEvent.press(sheet(mergeTitle('Make.com')).getByRole('button', { name: MERGE_ACTION }))
    // `\s` : le titre traduit porte des espaces insécables autour des guillemets.
    const dialog = dialogTitled(/^Rattacher\s«\sMake\.com\s»\sà\sMake/)

    await passTapGuard()
    await fireEvent.press(dialog.getByRole('button', { name: CANCEL }))

    expect(catalogueServer.received('POST', /\/merge$/)).toHaveLength(0)
    expect(card('Make.com').getByRole('button', { name: MERGE })).toBeTruthy()
  })

  describe('on the web, with the keyboard', () => {
    let returnPage: () => void = () => {}
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      returnPage = lendPage()
    })
    afterEach(() => returnPage())

    it('gives focus back to « Ajouter au catalogue » when the form is closed unchanged', async () => {
      await openAdmit()
      const restoreContains = lendContains(probe)
      const focus = watchFocus(probe)
      try {
        await fireEvent.press(screen.getByRole('button', { name: CANCEL }))

        await waitFor(() => expect(formOpen()).toBe(false))
        await waitFor(() => expect(spokenName(focus.last() as never)).toBe(ADMIT))
      } finally {
        focus.restore()
        restoreContains()
      }
    })

    // R6b, u8f : dans le navigateur, la feuille garde le focus pendant son fondu de sortie (le piège
    // du Modal reste actif) ; le résultat posé par l'écran à la fermeture y était ramené, puis, à la
    // fin du fondu, la feuille trouvait le focus perdu et le rendait par son nom au premier bouton
    // « Ajouter au catalogue » de la page : celui de la carte voisine.
    it('keeps the focus on the result of the decided card at the end of the fade, not on the next card’s button of the same name', async () => {
      await openTools()
      const page = globalThis.document as unknown as Record<string, unknown>
      const named = (name: string) => name === 'aria-label'
      // Le bouton touché : il a le focus à l'ouverture, et quitte la page avec la décision.
      const touched = { isConnected: true, getAttribute: (n: string) => (named(n) ? ADMIT : null) }
      // Le bouton de même nom de la carte voisine, tel que le navigateur le trouve par son nom ; une
      // vue de même classe que `probe`, pour que `watchFocus` voie son focus.
      const neighbour = Object.assign(
        Object.create(Object.getPrototypeOf(probe.current) as object) as object,
        {
          props: { accessibilityLabel: ADMIT },
          getAttribute: (n: string) => (named(n) ? ADMIT : null),
          getClientRects: () => ({ length: 1 }),
        },
      )
      page.querySelectorAll = (selector: string) => (selector.includes('button') ? [neighbour] : [])
      page.activeElement = touched
      await fireEvent.press(card('Teachable Machine').getByRole('button', { name: ADMIT }))
      await screen.findByLabelText(NAME)
      page.activeElement = null
      // La fin du fondu de sortie : le Modal de react-native-web appelle `onDismiss`.
      const fadeEnd = layerOf(screen.getByLabelText(NAME)).props as { onDismiss?: () => void }
      expect(fadeEnd.onDismiss).toBeInstanceOf(Function)
      const restoreContains = lendContains(probe)
      const focus = watchFocus(probe)
      try {
        await fillAdmit()
        touched.isConnected = false
        await fireEvent.press(screen.getByRole('button', { name: SAVE }))
        await waitFor(() => expect(formOpen()).toBe(false))
        await act(() => fadeEnd.onDismiss?.())

        expect(card('Teachable Machine').getByText(ADMITTED)).toBeTruthy()
        // Le dernier focus : le résultat de la carte décidée (son message, `role="status"`).
        expect(focus.last()).toMatchObject({ role: 'status' })
        expect(spokenName(focus.last() as never)).not.toBe(ADMIT)
      } finally {
        focus.restore()
        restoreContains()
      }
    })
  })
})

describe('the catalogue tab', () => {
  const openCatalogue = async () => {
    await openTools()
    await fireEvent.press(screen.getByRole('radio', { name: TAB_CATALOGUE }))
    await screen.findByText('Zapier')
  }

  it('lists the catalogue tools, and searches them by name', async () => {
    await openCatalogue()
    expect(screen.getByText('Lovable')).toBeTruthy()
    expect(screen.getByText('Make')).toBeTruthy()

    await fireEvent.changeText(
      screen.getByLabelText(t(($) => $.moderation.catalogue.searchCatalogue)),
      'Zap',
    )

    await waitFor(() =>
      expect(
        catalogueServer
          .received('GET', /^\/v1\/moderation\/tools\?/)
          .map((one) => new URLSearchParams(one.path.split('?')[1]).get('q')),
      ).toContain('Zap'),
    )
    await waitFor(() => expect(screen.queryByText('Lovable')).toBeNull())
    expect(screen.getByText('Zapier')).toBeTruthy()
  })

  it('creates a tool from « Ajouter un outil »', async () => {
    await openCatalogue()

    await fireEvent.press(
      screen.getByRole('button', { name: t(($) => $.moderation.catalogue.createTool) }),
    )
    expect(await screen.findByLabelText(CREATE_TITLE)).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText(NAME), 'Teachable Machine')
    await fillAdmit()
    await fireEvent.press(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(formOpen()).toBe(false))
    const created = catalogueServer.received('POST', /^\/v1\/moderation\/tools$/)
    expect(created.map((one) => one.body)).toEqual([
      {
        name: 'Teachable Machine',
        family: 'creation',
        descriptionFr: FR_TEXT,
        descriptionEn: EN_TEXT,
        siteUrl: null,
      },
    ])
  })

  it('edits a catalogue tool from its « Modifier »', async () => {
    await openCatalogue()

    const edit = t(($) => $.moderation.catalogue.edit)
    await fireEvent.press(rowWithButton('Zapier', edit).getByRole('button', { name: edit }))
    const name = await screen.findByLabelText(NAME)
    await waitFor(() => expect(name).toHaveDisplayValue('Zapier'))
    await fireEvent.changeText(name, 'Zapier Central')
    await fireEvent.press(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(formOpen()).toBe(false))
    const edited = catalogueServer.received('PATCH', /^\/v1\/moderation\/tools\/zapier$/)
    expect(edited).toHaveLength(1)
    expect(edited[0]?.body).toMatchObject({ name: 'Zapier Central' })
  })
})

describe('the recent changes', () => {
  it('shows who did what at the bottom of the page', async () => {
    catalogueServer.changes = [admitChange, mergeChange]
    await openTools()

    expect(await screen.findByRole('header', { name: CHANGES })).toBeTruthy()
    expect(
      screen.getByText(
        containing(
          t(($) => $.moderation.catalogue.change.tool_admit, {
            admin: 'Nora Benali',
            tool: 'Lovable',
          }),
        ),
      ),
    ).toBeTruthy()
  })

  it('says when there is no change yet', async () => {
    await openTools()

    expect(
      await screen.findByText(containing(t(($) => $.moderation.catalogue.changesEmpty))),
    ).toBeTruthy()
  })

  it('reads the recent changes again after a decision', async () => {
    await openTools()
    await waitFor(() =>
      expect(catalogueServer.received('GET', /catalogue-changes/).length).toBeGreaterThan(0),
    )
    const before = catalogueServer.received('GET', /catalogue-changes/).length

    await fireEvent.press(card('Suno Studio').getByRole('button', { name: DISMISS }))

    await waitFor(() =>
      expect(catalogueServer.received('GET', /catalogue-changes/).length).toBeGreaterThan(before),
    )
  })
})
