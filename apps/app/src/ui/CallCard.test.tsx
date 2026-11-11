// Tests de la carte d'un appel à tester (R7b, onglet « Appels » du coin des testeurs ; planche
// validée 9, relecture du plan sec-A4, juridique J8). L'auteur lance un appel (« Essayez le niveau 3
// ce week-end ») ; ses testeurs le lisent dans le coin. La carte montre le texte entier, une photo
// facultative et la date relative ; le menu « … » (supprimer, signaler) est nommé par l'extrait.
// La photo est privée au coin : elle est nommée par sa description et chargée sans cache disque
// (sec-A4 : l'appareil ne garde pas une image que le membre ne pourra plus voir).
//
// Les deux derniers tests sont communs aux deux images du coin (la photo d'un appel et la capture
// d'un retour, `MessageBubble`) : la règle est la même, on la vérifie d'un seul tenant.
//
// L'API (plan R7b, « Briques du fil et du coin, API fixée ») :
// `CallCard({ text: string, at: string, photo?: { source: ImageSource, description: string } | null,
//   removal?: ReactNode, menu?: ActionMenuItem[] })`.
import { nameOf } from '@ruche/i18n'
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps, ReactElement } from 'react'
import { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CallCard } from './CallCard'
import { MessageBubble } from './MessageBubble'
import { relativeDate } from './relativeDate'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const CALL =
  'Essayez le niveau 3 ce week-end, surtout sur téléphone.\nDites-moi si le score repart à zéro.'
const SHORT_CALL = 'Essayez le mode nuit'
const PHOTO_URI = 'https://api.example/v1/projects/p1/testers/media/call-1'
const CAPTURE_URI = 'https://api.example/v1/projects/p1/testers/media/msg-1'
const PHOTO_DESCRIPTION = 'Le niveau 3 vu d’en haut, avec ses trois portes'

/** Dix jours plus tôt : une date courte (« 1 nov. »), qui ne bouge pas pendant le test. */
const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

const text = {
  menu: (excerpt: string) => fr.t(($) => $.project.testers.calls.menu, { excerpt }),
  delete: fr.t(($) => $.project.testers.calls.delete),
  report: fr.t(($) => $.project.testers.calls.report),
  captureName: (name: string) =>
    fr.t(($) => $.project.testers.feedback.captureName, { nameOf: nameOf('fr', name) }),
}

type CardProps = ComponentProps<typeof CallCard>

const card = (props: Partial<CardProps> = {}): ReactElement => (
  <CallCard text={CALL} at={TEN_DAYS_AGO} {...props} />
)

const photo = { source: { uri: PHOTO_URI }, description: PHOTO_DESCRIPTION }

// --- Les outils ----------------------------------------------------------------------------------

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

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

/** Les éléments qui dessinent l'image de cette adresse. */
const imagesOf = (uri: string) =>
  all().filter((node) => JSON.stringify(node.props.source ?? null).includes(uri))

// --- Les tests -----------------------------------------------------------------------------------

describe('CallCard', () => {
  it('shows the whole text of the call and its relative date', async () => {
    await renderWithProviders(card())

    // Le texte entier, jamais replié ni coupé : un appel se lit d'un bout à l'autre.
    expect(screen.getByText(CALL)).toBeTruthy()
    expect(screen.getByText(relativeDate(TEN_DAYS_AGO, 'fr').label)).toBeTruthy()
  })

  it('shows one photo, named by its description', async () => {
    await renderWithProviders(card({ photo }))

    expect(imagesOf(PHOTO_URI).length).toBeGreaterThan(0)
    expect(spokenNames()).toContain(PHOTO_DESCRIPTION)
  })

  it('shows no photo when the call has none', async () => {
    await renderWithProviders(card({ photo: null }))

    expect(screen.getByText(CALL)).toBeTruthy() // témoin
    expect(imagesOf(PHOTO_URI)).toEqual([])
  })

  it('names its menu by the call excerpt and runs the chosen action', async () => {
    const onDelete = jest.fn()
    await renderWithProviders(
      card({
        text: SHORT_CALL,
        menu: [{ label: text.delete, onPress: onDelete, tone: 'danger' }],
      }),
    )

    // `\s` : le français a des espaces insécables dans « ».
    expect(text.menu(SHORT_CALL)).toMatch(/^Actions de l’appel «\sEssayez le mode nuit\s»$/)
    await fireEvent.press(screen.getByRole('button', { name: text.menu(SHORT_CALL) }))
    await fireEvent.press(screen.getByRole('menuitem', { name: text.delete }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('gives two calls two menu names', async () => {
    const menu = [{ label: text.report, onPress: () => {} }]
    await renderWithProviders(
      <View>
        {card({ text: SHORT_CALL, menu })}
        {card({ text: 'Testez la musique', menu })}
      </View>,
    )

    expect(screen.getByRole('button', { name: text.menu(SHORT_CALL) })).toBeTruthy()
    expect(screen.getByRole('button', { name: text.menu('Testez la musique') })).toBeTruthy()
  })

  it('has no « … » button when it has no action', async () => {
    await renderWithProviders(card({ menu: [] }))

    expect(screen.getByText(CALL)).toBeTruthy() // témoin
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the removal notice it is given', async () => {
    const notice = 'Retiré par la modération'
    await renderWithProviders(card({ removal: <Text>{notice}</Text> }))

    expect(screen.getByText(notice)).toBeTruthy()
  })
})

describe('The images of the testers corner', () => {
  /** Un appel avec sa photo, et un retour d'Inès avec sa capture, côte à côte. */
  const both = () => (
    <View>
      <CallCard text={CALL} at={TEN_DAYS_AGO} photo={photo} />
      <MessageBubble
        from="tester"
        kind="feedback"
        mine={false}
        name="Inès Morel"
        text="Le score repart à zéro."
        at={TEN_DAYS_AGO}
        capture={{ source: { uri: CAPTURE_URI }, description: text.captureName('Inès Morel') }}
      />
    </View>
  )

  it('names the call photo and the feedback capture', async () => {
    await renderWithProviders(both())

    const names = spokenNames()
    expect(names).toContain(PHOTO_DESCRIPTION)
    expect(names).toContain(text.captureName('Inès Morel'))
  })

  it('loads a tester capture without the disk cache', async () => {
    await renderWithProviders(both())

    // `cachePolicy="memory"` (expo-image) : l'image reste en mémoire le temps de la visite, jamais
    // écrite sur le disque de l'appareil (sec-A4).
    for (const uri of [PHOTO_URI, CAPTURE_URI]) {
      const images = imagesOf(uri)
      // Témoin : l'image est dessinée.
      expect({ uri, drawn: images.length > 0 }).toEqual({ uri, drawn: true })
      expect({ uri, policies: images.map((node) => node.props.cachePolicy) }).toEqual({
        uri,
        policies: images.map(() => 'memory'),
      })
    }
  })
})
