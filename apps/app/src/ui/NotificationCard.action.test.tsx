// Tests de l'action d'une ligne de la page « Activité » (R9, 7d) : une notification de la
// modération porte un geste à elle, hors de la zone qui mène au contenu.
// - « Contester » sur un retrait : il ouvre la messagerie sur notre adresse de contact, avec un objet
//   qui nomme la décision (J12 : « Contestation : retrait de mon commentaire sur « Météo » du
//   12 nov. »), par `ui/ContactLink`.
// - « Choisir un pseudo » sur un pseudo remplacé d'office : un geste de l'écran (`onPress`).
// Le scénario (refonte, « Accessibilité ») veut aussi la citation du contenu sous la phrase, avant
// « Contester ».
//
// L'API attendue (plan de R9, « Ce qui change au plan », ui-P4) :
//   action?: { label: string; onPress: () => void } | { label: string; contact: { subject: string } }
//   absente : rien de plus qu'avant ; le contrôle est nommé par `label` (WCAG 2.5.3) et ne se
//   trouve pas dans le lien de la ligne (deux gestes, deux contrôles).
import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { Linking } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { NotificationCard } from './NotificationCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Props = ComponentProps<typeof NotificationCard>

const CONTEST = fr.t(($) => $.notifications.contest)
const CHOOSE = fr.t(($) => $.notifications.chooseHandle)
/** L'objet de l'e-mail : la décision contestée et sa date (J12). */
const SUBJECT = fr.t(($) => $.removal.contestSubject, {
  decision: fr.t(($) => $.removal.contestDecision.comment, { title: 'Météo' }),
  date: '12 nov.',
})
/** L'extrait du commentaire retiré, tel que la ligne le cite. */
const QUOTE = 'Ce code ne marche pas, arrête de le partager.'

/** « Ton commentaire sur Météo a été retiré », en morceaux, comme notifications/present.ts. */
const removed: Props['parts'] = [
  { text: 'Ton commentaire sur ' },
  { text: 'Météo', style: 'strong' },
  { text: ' a été retiré par la modération' },
]
const SENTENCE = 'Ton commentaire sur Météo a été retiré par la modération'

/** Une notification de retrait : l'icône rouge, la date absolue, la citation, l'explication. */
const base: Props = {
  leading: { kind: 'icon', icon: 'flag', tone: 'danger' },
  parts: removed,
  when: '12 nov.',
  quote: QUOTE,
  detail: 'Fondement : la loi.',
  thumb: { kind: 'project', image: null, title: 'Météo' },
  isNew: true,
  onPress: () => {},
}

let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

/** L'adresse ouverte par le dernier toucher. */
const opened = (): string => String(openURL.mock.calls.at(-1)?.[0] ?? '')

type Host = { props: Record<string, unknown>; parent: Host | null; children: (Host | string)[] }

/** Vrai si `inner` est rangé quelque part sous `outer` dans l'arbre rendu. */
const isInside = (inner: unknown, outer: unknown): boolean => {
  let node = (inner as Host).parent
  while (node) {
    if (node === outer) return true
    node = node.parent
  }
  return false
}

/** La place d'un élément dans l'ordre de lecture (l'ordre de l'arbre, en profondeur d'abord). */
const readingOrder = (element: unknown): number => {
  let index = 0
  let found = -1
  const visit = (node: Host | string) => {
    if (typeof node === 'string' || found >= 0) return
    if (node === element) found = index
    index += 1
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Host)
  return found
}

/** Le lien de la ligne entière, nommé par sa phrase. */
const rowLink = () => screen.getByRole('link', { name: containing(SENTENCE) })

describe('NotificationCard action', () => {
  it('opens the contact address with the decision in the subject from a removal notification', async () => {
    await renderWithProviders(
      <NotificationCard {...base} action={{ label: CONTEST, contact: { subject: SUBJECT } }} />,
    )

    await fireEvent.press(screen.getByRole('link', { name: CONTEST }))

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(opened().startsWith(`mailto:${contactEmail}?subject=`)).toBe(true)
    // Un `mailto:` code les espaces en `%20` (RFC 6068) : `decodeURIComponent`.
    expect(decodeURIComponent(opened().split('?subject=')[1] ?? '')).toBe(SUBJECT)
  })

  it('keeps « Contester » out of the link of the row, which still leads to the content', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <NotificationCard
        {...base}
        onPress={onPress}
        action={{ label: CONTEST, contact: { subject: SUBJECT } }}
      />,
    )

    const contest = screen.getByRole('link', { name: CONTEST })
    // Deux contrôles côte à côte, jamais l'un dans l'autre : un lien dans un lien ne se touche pas
    // seul, et le lecteur d'écran lirait « Contester » dans le nom de la ligne.
    expect(isInside(contest, rowLink())).toBe(false)
    expect(String(rowLink().props.accessibilityLabel ?? '')).not.toMatch(containing(CONTEST))

    await fireEvent.press(contest)
    expect(onPress).not.toHaveBeenCalled()
    await fireEvent.press(rowLink())
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledTimes(1)
  })

  it('cites the removed content under the sentence, before « Contester »', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        onPress={null}
        action={{ label: CONTEST, contact: { subject: SUBJECT } }}
      />,
    )

    const quote = screen.getByText(QUOTE)
    const contest = screen.getByRole('link', { name: CONTEST })
    expect(readingOrder(quote)).toBeGreaterThan(-1)
    expect(readingOrder(quote)).toBeLessThan(readingOrder(contest))
  })

  it('offers « Contester » on a row that leads nowhere', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        onPress={null}
        action={{ label: CONTEST, contact: { subject: SUBJECT } }}
      />,
    )

    // Témoin : la ligne ne mène nulle part, sa phrase se lit.
    expect(screen.queryByRole('link', { name: containing(SENTENCE) })).toBeNull()
    await fireEvent.press(screen.getByRole('link', { name: CONTEST }))
    expect(opened().startsWith(`mailto:${contactEmail}`)).toBe(true)
  })

  it('runs its own gesture from an action with onPress, never the one of the row', async () => {
    const onRow = jest.fn()
    const onChoose = jest.fn()
    await renderWithProviders(
      <NotificationCard {...base} onPress={onRow} action={{ label: CHOOSE, onPress: onChoose }} />,
    )

    // Un bouton ou un lien, au choix du composant, nommé par son texte affiché.
    const action =
      screen.queryByRole('link', { name: CHOOSE }) ?? screen.getByRole('button', { name: CHOOSE })
    expect(isInside(action, rowLink())).toBe(false)
    await fireEvent.press(action)

    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onRow).not.toHaveBeenCalled()
    expect(openURL).not.toHaveBeenCalled()
  })

  it('adds no control without an action', async () => {
    await renderWithProviders(<NotificationCard {...base} />)

    // Témoin : la ligne reste un lien.
    expect(rowLink()).toBeTruthy()
    expect(screen.queryByRole('link', { name: CONTEST })).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
