// Tests de la date relative prise dans une phrase (R4, « @sam · Bloqué hier ») : on voit la phrase
// courte, le lecteur d'écran lit la phrase avec la date complète, et sur le web la bulle du survol
// garde la date complète seule. Les autres comportements de `RelativeTime` (horloge, pré-rendu) sont
// dans RelativeTime.test.tsx.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { parisDateTime } from './parisTime'
import { type RelativePhrase, RelativeTime } from './RelativeTime'
import type { RelativeDate } from './relativeDate'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les blancs d'Intl ramenés à des espaces, comme getByText. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

/** Le mardi 20 octobre 2026 à midi, heure de Paris ; le blocage date de la veille au soir. */
const now = new Date('2026-10-20T10:00:00.000Z')
const blockedAt = '2026-10-19T18:30:00.000Z'
const full = parisDateTime(blockedAt, 'fr', now).dateTime

/** La phrase d'une ligne de « Membres bloqués », écrite ici sans traduction. */
const phrase = ({ afterVerb, full: date }: RelativeDate): RelativePhrase => ({
  label: `@sam · Bloqué ${afterVerb}`,
  spoken: `@sam · Bloqué le ${date}`,
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: unknown[] }

/** Tous les nœuds rendus, pour y chercher une propriété (la bulle `title`). */
const allNodes = (): Node[] => {
  const found: Node[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object' || !('props' in node)) return
    found.push(node as Node)
    for (const child of (node as Node).children) visit(child)
  }
  visit(screen.root)
  return found
}

/** Vrai si l'élément, ou un de ses ancêtres, est caché aux lecteurs d'écran. */
const hiddenFromReaders = (element: unknown): boolean => {
  for (let node = element as Node | null; node; node = node.parent) {
    if (node.props['aria-hidden'] === true) return true
  }
  return false
}

describe('a relative date inside a sentence', () => {
  it('shows the short sentence and reads the one with the full date, on a phone', async () => {
    await renderWithProviders(<RelativeTime date={blockedAt} now={now} phrase={phrase} />)

    expect(screen.getByText('@sam · Bloqué hier')).toBeTruthy()
    expect(screen.getByLabelText(plain(`@sam · Bloqué le ${full}`))).toBeTruthy()
  })

  it('hides the short sentence from readers on the web, writes the full one, and keeps the date alone on hover', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<RelativeTime date={blockedAt} now={now} phrase={phrase} />)

      const shown = screen.getByText('@sam · Bloqué hier', { includeHiddenElements: true })
      expect(hiddenFromReaders(shown)).toBe(true)
      const spoken = screen.getByText(plain(`@sam · Bloqué le ${full}`))
      expect(hiddenFromReaders(spoken)).toBe(false)
      // La bulle du survol : la date complète, sans la phrase autour.
      expect(allNodes().some((node) => node.props.title === full)).toBe(true)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
