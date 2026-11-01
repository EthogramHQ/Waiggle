// Tests de la carte d'une note du fil (R4 « le fil et les cartes ») : sa date se dit par rapport à
// maintenant (« il y a 2 h », `RelativeTime`), et le lecteur d'écran l'entend en entier (« 20
// octobre à 12:00 »). Toute la carte est un lien nommé « Note de Léa sur… » (les tests du fil et
// le parcours le cherchent par ce nom) : la date ne s'ajoute pas au nom, elle le décrit, après le
// texte de la note (`aria-describedby` sur le web). Les tests plus anciens de la carte (lien, texte
// tel qu'écrit) sont dans `components.test.tsx`.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { NoteCard } from './NoteCard'
import { parisDateTime } from './parisTime'
import { RelativeTime } from './RelativeTime'
import { relativeDate } from './relativeDate'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le mardi 20 octobre 2026 à 14 h, heure de Paris. */
const now = new Date('2026-10-20T12:00:00.000Z')
/** La note, publiée deux heures plus tôt. */
const createdAt = '2026-10-20T10:00:00.000Z'
const { label } = relativeDate(createdAt, 'fr', now)
const full = parisDateTime(createdAt, 'fr', now).dateTime

const card = {
  label: 'Note de Léa sur Mon agent de recettes',
  project: 'Mon agent de recettes',
  author: { name: 'Léa', avatar: null },
  body: 'v2 : mode hors ligne',
  when: <RelativeTime date={createdAt} now={now} />,
}

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Le nœud qui porte cet identifiant (`nativeID`), cherché dans tout l'arbre rendu. */
const byNativeId = (id: string): Node | null => {
  const walk = (node: Node | string): Node | null => {
    if (typeof node === 'string') return null
    if (node.props.nativeID === id) return node
    for (const child of node.children) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(screen.root as unknown as Node)
}

/** Ce qu'un lecteur d'écran lit d'un nœud : son texte, sans ce qui lui est caché (`aria-hidden`). */
const readable = (node: Node | string): string =>
  typeof node === 'string'
    ? node
    : node.props['aria-hidden'] === true
      ? ''
      : node.children.map(readable).join('')

/** Les blancs d'Intl et de la typographie française ramenés à des espaces simples. */
const plain = (text: string) => text.replace(/\s+/g, ' ').trim()

describe('NoteCard, with a relative date (R4)', () => {
  it('shows the date relative to now, and reads it in full', async () => {
    await renderWithProviders(<NoteCard {...card} onPress={jest.fn()} />)

    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByLabelText(full)).toBeTruthy()
    // Le nom du lien ne change pas : le fil et le parcours le cherchent tel quel.
    expect(screen.getByRole('link', { name: 'Note de Léa sur Mon agent de recettes' })).toBeTruthy()
  })

  it('on the web, describes the link by the note, then by its full date', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<NoteCard {...card} onPress={jest.fn()} />)

      const link = screen.getByRole('link', { name: 'Note de Léa sur Mon agent de recettes' })
      const ids = String(link.props['aria-describedby'] ?? '').split(' ')
      expect(ids).toHaveLength(2)
      const [bodyId, dateId] = ids as [string, string]
      const body = byNativeId(bodyId)
      const date = byNativeId(dateId)
      expect(body && plain(readable(body))).toBe(card.body)
      // Le texte court (« il y a 2 h ») est caché au lecteur d'écran : il lit la date complète.
      expect(date && plain(readable(date))).toBe(plain(full))
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps a date written as text, beside the author', async () => {
    await renderWithProviders(<NoteCard {...card} when="14 oct." onPress={jest.fn()} />)

    expect(screen.getByText('14 oct.')).toBeTruthy()
    expect(screen.getByText('Léa')).toBeTruthy()
  })
})
