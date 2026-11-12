// Tests de la bulle d'un message du fil d'un testeur (R7b, le coin des testeurs ; planches validées
// 4 et 6, relecture du plan ui-A1 à A5, ui-B4, sec-A4). Un fil est privé : un testeur et l'auteur du
// projet s'y écrivent. Chaque message est une bulle :
// - un élément de la liste du fil (`listitem`, la liste est posée par l'écran), jamais un titre ;
// - nommée par la bulle elle-même : « Retour d'Inès Morel, 1 nov. », « Réponse de Papi Jean, … »,
//   ou « Ton retour, … » / « Ta réponse, … » pour qui l'a écrite ;
// - colorée par le rôle de qui l'a envoyée (auteur : crème miel, testeur : blanc), quel que soit le
//   lecteur : la même conversation a les mêmes couleurs pour les deux personnes ;
// - l'issue d'un retour en pastille (`OutcomePill`), lue « Ça a marché : En partie » ;
// - une capture d'écran éventuelle, nommée par le texte fixe que l'écran lui donne et chargée sans
//   cache disque (sec-A4 : une image privée ne reste pas sur l'appareil) ;
// - le menu « … », nommé par l'extrait du message pour qu'on sache lequel on ouvre.
//
// L'API (plan R7b, « Briques du fil et du coin, API fixée ») :
// `MessageBubble({ from: TesterRole, kind: TesterMessageKind, mine: boolean, name: string,
//   text: string | null, at: string, outcome?: { value: FeedbackOutcome, label: string } | null,
//   device?: string | null, capture?: { source: ImageSource, description: string } | null,
//   settled?: string | null, removal?: ReactNode, menu?: ActionMenuItem[] })`.
//
// Ce que Jest ne voit pas (captures et catalogue) : le côté (auteur à droite, testeur à gauche), la
// largeur jusqu'à 80 % de la colonne, le texte à 200 % sans débordement.
import { palettes } from '@ruche/brand'
import type { FeedbackOutcome, TesterMessageKind, TesterRole } from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps, ReactElement } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import type { ImageSource } from './image'
import { MessageBubble } from './MessageBubble'
import { relativeDate } from './relativeDate'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const INES = 'Inès Morel'
const JEAN = 'Papi Jean'
const FEEDBACK_TEXT = 'Le niveau 3 rame un peu sur mon téléphone.'
const REPLY_TEXT = 'Merci, je regarde ce soir.'

/** Dix jours plus tôt : la date affichée est une date courte (« 1 nov. »), qui ne bouge pas. */
const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

const CAPTURE_URI = 'https://api.example/v1/projects/p1/testers/media/m1'
const capture = (description: string): { source: ImageSource; description: string } => ({
  source: { uri: CAPTURE_URI },
  description,
})

const text = {
  feedbackOf: (name: string, time: string) =>
    fr.t(($) => $.project.testers.thread.feedbackOf, { nameOf: nameOf('fr', name), time }),
  replyOf: (name: string, time: string) =>
    fr.t(($) => $.project.testers.thread.replyOf, { nameOf: nameOf('fr', name), time }),
  mineFeedback: (time: string) => fr.t(($) => $.project.testers.thread.mineFeedback, { time }),
  mineReply: (time: string) => fr.t(($) => $.project.testers.thread.mineReply, { time }),
  menu: (excerpt: string) => fr.t(($) => $.project.testers.thread.menu, { excerpt }),
  menuNoText: (name: string) =>
    fr.t(($) => $.project.testers.thread.menuNoText, { nameOf: nameOf('fr', name) }),
  menuMineNoText: fr.t(($) => $.project.testers.thread.menuMineNoText),
  outcome: (value: FeedbackOutcome) => fr.t(($) => $.project.testers.feedback.outcomes[value]),
  outcomeSpoken: (outcome: string) =>
    fr.t(($) => $.project.testers.feedback.outcomeSpoken, { outcome }),
  captureName: (name: string) =>
    fr.t(($) => $.project.testers.feedback.captureName, { nameOf: nameOf('fr', name) }),
  settledIn: (version: string) => fr.t(($) => $.project.testers.thread.settledIn, { version }),
  devicePhone: fr.t(($) => $.project.testers.feedback.devices.phone),
  delete: fr.t(($) => $.project.testers.thread.delete),
}

/**
 * Les façons d'écrire la date d'un nom lu : la bulle choisit la sienne (la forme courte, ou la date
 * complète, comme le veut un nom qui reprend une date : `useRelativeDate().full`).
 */
const timeForms = (iso: string): string[] => {
  const date = relativeDate(iso, 'fr')
  return [date.label, date.afterVerb, date.full]
}

type BubbleProps = ComponentProps<typeof MessageBubble>

/** Un retour d'Inès, lu par l'auteur ; chaque test change ce qui l'intéresse. */
const bubble = (props: Partial<BubbleProps> = {}): ReactElement => (
  <MessageBubble
    from="tester"
    kind="feedback"
    mine={false}
    name={INES}
    text={FEEDBACK_TEXT}
    at={TEN_DAYS_AGO}
    {...props}
  />
)

// --- Les outils ----------------------------------------------------------------------------------

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = {
  props: Record<string, unknown>
  parent: Host | null
  children: ReadonlyArray<Host | string>
}

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

/** Tous les noms lus de l'arbre (téléphone et web), cachés compris. */
const spokenNames = (): string[] =>
  all().flatMap((node) =>
    [node.props.accessibilityLabel, node.props['aria-label']].filter(
      (name): name is string => typeof name === 'string',
    ),
  )

/** Les noms attendus que l'arbre porte vraiment (vide : aucun des attendus n'est lu). */
const spokenAmong = (expected: string[]) => expected.filter((name) => spokenNames().includes(name))

const roleOf = (node: Host) => node.props.role ?? node.props.accessibilityRole

/** Les couleurs de fond posées dans l'arbre, lues par leur valeur (les rôles de `packages/brand`). */
const backgrounds = (): unknown[] =>
  all().map((node) => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.backgroundColor)

/** Le menu « … » de ce nom, ou rien. */
const menuButton = (name: string) => screen.queryByRole('button', { name })

// --- Les tests -----------------------------------------------------------------------------------

describe('MessageBubble', () => {
  it('shows the text of the message exactly as written, and its date', async () => {
    const body = '**Bravo** : <b>ça marche</b>\nSauf le niveau 3.'
    await renderWithProviders(bubble({ text: body }))

    expect(screen.getByText(body)).toBeTruthy()
    // La date relative est écrite sous la bulle (une date courte, dix jours plus tôt).
    expect(screen.getByText(relativeDate(TEN_DAYS_AGO, 'fr').label)).toBeTruthy()
  })

  it('is a list item, never a heading', async () => {
    await renderWithProviders(bubble())

    expect(screen.getByText(FEEDBACK_TEXT)).toBeTruthy() // témoin
    expect(all().filter((node) => roleOf(node) === 'listitem')).toHaveLength(1)
    expect(all().filter((node) => roleOf(node) === 'header' || roleOf(node) === 'heading')).toEqual(
      [],
    )
  })

  it.each([
    ['feedback', 'tester', INES, text.feedbackOf],
    ['reply', 'author', JEAN, text.replyOf],
  ] as const)(
    'names the %s of another member by its sender and date',
    async (kind, from, name, of) => {
      await renderWithProviders(bubble({ kind, from, name, mine: false }))

      // Ex. : « Retour d’Inès Morel, 1 nov. », « Réponse de Papi Jean, 1 nov. ».
      expect(spokenAmong(timeForms(TEN_DAYS_AGO).map((time) => of(name, time)))).not.toEqual([])
    },
  )

  it.each([
    ['feedback', 'tester', text.mineFeedback],
    ['reply', 'author', text.mineReply],
  ] as const)('names your own %s « Ton retour » or « Ta réponse »', async (kind, from, mine) => {
    await renderWithProviders(bubble({ kind, from, mine: true }))

    expect(spokenAmong(timeForms(TEN_DAYS_AGO).map(mine))).not.toEqual([])
    // Jamais son propre nom : « Retour d'Inès » n'est pas lu à Inès.
    expect(spokenAmong(timeForms(TEN_DAYS_AGO).map((time) => text.feedbackOf(INES, time)))).toEqual(
      [],
    )
  })

  it('colours a bubble by its sender role, whoever reads it', async () => {
    // Les quatre cas : l'auteur ou le testeur l'a envoyée, l'un ou l'autre la lit (`mine`). La
    // couleur suit `from`, jamais `mine` ; de jour comme de nuit.
    const cases: { from: TesterRole; kind: TesterMessageKind; mine: boolean }[] = [
      { from: 'author', kind: 'reply', mine: true },
      { from: 'author', kind: 'reply', mine: false },
      { from: 'tester', kind: 'feedback', mine: true },
      { from: 'tester', kind: 'feedback', mine: false },
    ]
    for (const scheme of ['day', 'night'] as const) {
      const colors = palettes[scheme]
      // Témoin : les deux rôles ont deux couleurs, sinon le test ne prouverait rien.
      expect(colors.bubbleAuthor).not.toBe(colors.bubbleTester)
      for (const { from, kind, mine } of cases) {
        const view = await renderWithProviders(bubble({ from, kind, mine }), 'fr', scheme)

        const painted = backgrounds()
        if (from === 'author') {
          expect({ from, mine, scheme, author: painted.includes(colors.bubbleAuthor) }).toEqual({
            from,
            mine,
            scheme,
            author: true,
          })
        } else {
          expect({
            from,
            mine,
            scheme,
            author: painted.includes(colors.bubbleAuthor),
            tester: painted.includes(colors.bubbleTester),
          }).toEqual({ from, mine, scheme, author: false, tester: true })
        }
        await view.unmount()
      }
    }
  })

  it('reads the outcome as « Ça a marché : En partie »', async () => {
    await renderWithProviders(
      bubble({ outcome: { value: 'partly', label: text.outcome('partly') } }),
    )

    const spoken = text.outcomeSpoken(text.outcome('partly'))
    // `\s` : le français a une espace insécable avant « : ».
    expect(spoken).toMatch(/^Ça a marché\s:\sEn partie$/)
    expect(screen.getByLabelText(spoken)).toBeTruthy()
    // Le mot se voit dans la pastille.
    expect(screen.getByText(text.outcome('partly'))).toBeTruthy()
  })

  it('shows no outcome on a reply', async () => {
    await renderWithProviders(
      bubble({ kind: 'reply', from: 'author', name: JEAN, text: REPLY_TEXT }),
    )

    expect(screen.getByText(REPLY_TEXT)).toBeTruthy() // témoin
    expect(screen.queryByText(/Ça a marché/)).toBeNull()
    expect(spokenNames().some((name) => /Ça a marché/.test(name))).toBe(false)
  })

  it('shows the device and the « Réglé » line it is given', async () => {
    const settled = text.settledIn('v1.3')
    await renderWithProviders(bubble({ device: text.devicePhone, settled }))

    expect(screen.getByText(text.devicePhone)).toBeTruthy()
    expect(screen.getByText(settled)).toBeTruthy()
  })

  it('shows the removal notice it is given', async () => {
    const notice = 'Retiré par la modération'
    await renderWithProviders(bubble({ removal: <Text>{notice}</Text> }))

    expect(screen.getByText(notice)).toBeTruthy()
  })

  it('names the capture by the fixed name it is given', async () => {
    const name = text.captureName(INES)
    await renderWithProviders(bubble({ capture: capture(name) }))

    // « Capture d’écran jointe au retour d’Inès Morel » : jamais une description écrite par le
    // testeur (juridique J8), l'écran donne ce texte fixe.
    expect(name).toMatch(/^Capture d’écran jointe au retour d’Inès Morel$/)
    expect(spokenNames()).toContain(name)
  })

  it('loads its capture from memory only, never from the disk cache', async () => {
    await renderWithProviders(bubble({ capture: capture(text.captureName(INES)) }))

    const images = all().filter((node) =>
      JSON.stringify(node.props.source ?? null).includes(CAPTURE_URI),
    )
    // Témoin : la capture est dessinée.
    expect(images.length).toBeGreaterThan(0)
    expect(images.map((node) => node.props.cachePolicy)).toEqual(images.map(() => 'memory'))
  })

  it('describes each message menu by the message text', async () => {
    const onDelete = jest.fn()
    await renderWithProviders(
      <View>
        {bubble({ menu: [{ label: text.delete, onPress: onDelete, tone: 'danger' }] })}
        {bubble({
          kind: 'reply',
          from: 'author',
          name: JEAN,
          text: REPLY_TEXT,
          menu: [{ label: text.delete, onPress: () => {} }],
        })}
      </View>,
    )

    // Deux menus, deux noms : chacun dit de quel message il s'agit.
    expect(menuButton(text.menu(FEEDBACK_TEXT))).toBeTruthy()
    expect(menuButton(text.menu(REPLY_TEXT))).toBeTruthy()

    const trigger = menuButton(text.menu(FEEDBACK_TEXT))
    if (!trigger) throw new Error('menu attendu')
    await fireEvent.press(trigger)
    await fireEvent.press(screen.getByRole('menuitem', { name: text.delete }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('names the menu of a feedback without text by its sender, or « ton retour »', async () => {
    const menu = [{ label: text.delete, onPress: () => {} }]
    const view = await renderWithProviders(bubble({ text: null, menu }))
    expect(menuButton(text.menuNoText(INES))).toBeTruthy()
    await view.unmount()

    await renderWithProviders(bubble({ text: null, mine: true, menu }))
    expect(menuButton(text.menuMineNoText)).toBeTruthy()
  })

  it('has no « … » button when it has no action', async () => {
    await renderWithProviders(bubble({ menu: [] }))

    expect(screen.getByText(FEEDBACK_TEXT)).toBeTruthy() // témoin
    expect(screen.queryByRole('button')).toBeNull()
  })
})

// R7b, K13 (ui-A1) : un geste en cours et son erreur, sous la bulle qu'ils concernent.
describe('a gesture on a message', () => {
  it('shows the pending gesture under the bubble, inside its list item', async () => {
    await renderWithProviders(bubble({ pending: 'Enregistrement…' }))

    const text = screen.getByText('Enregistrement…') as unknown as {
      props: Record<string, unknown>
      parent: unknown
    }
    let node: typeof text | null = text
    while (node && node.props.role !== 'listitem') node = node.parent as typeof node
    expect(node).not.toBeNull()
  })

  it('shows nothing pending by default', async () => {
    await renderWithProviders(bubble())

    expect(screen.getByText(FEEDBACK_TEXT)).toBeTruthy() // témoin
    expect(screen.queryByText('Enregistrement…')).toBeNull()
  })

  it('shows the notice of a failed gesture with the message', async () => {
    await renderWithProviders(bubble({ notice: <Text>Le changement a échoué.</Text> }))

    expect(screen.getByText('Le changement a échoué.')).toBeTruthy()
  })
})
