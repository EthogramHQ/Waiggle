// Tests du bandeau d'un contenu retiré par la modération (tranche 7a), et des phrases que l'appli y
// pose. Dans son propre fichier plutôt que dans components.test.tsx, partagé par toute l'interface.
//
// R9 (7d, « À reprendre » de 7a et 7b, scénario refonte, « Accessibilité ») : le bandeau devient un
// groupe nommé par son titre (son texte se fondait avec le suivant dans l'arbre lu), et il gagne
// `contest?: { subject: string }` : « Pour contester » écrit l'adresse de contact en entier et en
// fait un lien `mailto:` dont l'objet nomme la décision (J12), après toutes les autres phrases.
import { contactEmail } from '@ruche/brand'
import type { Removal } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { removalBanner } from '../reports/removal'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { RemovalNotice } from './RemovalNotice'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const banner = {
  title: 'Retiré par la modération',
  lines: ['Il n’est plus visible que de toi.', 'Pour contester : contact@example.com'],
}

type Host = { props: Record<string, unknown>; children: (Host | string)[] }
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/**
 * Le groupe nommé `name`. Par son nom puis son rôle, pas par `getByRole` : RNTL n'y trouve que les
 * vues `accessible`, et un groupe `accessible` ne laisse plus atteindre, sur iOS, ce qu'il contient
 * (le lien « Pour contester »). Le rôle et le nom suffisent au lecteur d'écran.
 */
const noticeGroup = (name: string) => {
  const found = screen.queryAllByLabelText(name).find((node) => roleOf(node.props) === 'group')
  if (!found) throw new Error(`no group named « ${name} »`)
  return found
}

/** Toutes les vues de rôle `group` du rendu. */
const allGroups = (): Host[] => {
  const walk = (node: Host): Host[] => [
    ...(roleOf(node.props) === 'group' ? [node] : []),
    ...node.children.flatMap((child) => (typeof child === 'string' ? [] : walk(child))),
  ]
  return walk(screen.root as unknown as Host)
}

describe('RemovalNotice', () => {
  it('shows its title, then each sentence on its own line', async () => {
    await renderWithProviders(<RemovalNotice {...banner} />)

    expect(screen.getByText('Retiré par la modération')).toBeTruthy()
    for (const line of banner.lines) expect(screen.getByText(line)).toBeTruthy()
  })

  it('is no alert: it is there from the start, and is read in turn', async () => {
    await renderWithProviders(<RemovalNotice {...banner} />)

    // Témoin : le bandeau est affiché.
    expect(screen.getByText('Retiré par la modération')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('names the removal notice group by its title', async () => {
    await renderWithProviders(<RemovalNotice {...banner} />)

    const group = noticeGroup(banner.title)
    // Le groupe porte le bandeau entier : ses phrases s'y lisent, pas à côté.
    for (const line of banner.lines) expect(within(group).getByText(line)).toBeTruthy()
  })

  it('keeps one group per notice, each named by its own title', async () => {
    await renderWithProviders(
      <>
        <RemovalNotice {...banner} />
        <RemovalNotice title="Retiré par la modération (2)" lines={['Une autre phrase.']} compact />
      </>,
    )

    expect(allGroups()).toHaveLength(2)
    const second = noticeGroup('Retiré par la modération (2)')
    expect(within(second).getByText('Une autre phrase.')).toBeTruthy()
    expect(within(second).queryByText(banner.lines[0] ?? '')).toBeNull()
  })
})

describe('RemovalNotice with contest', () => {
  /** Les phrases d'un retrait sans « Pour contester » : le composant l'écrit lui-même. */
  const lines = [
    'Il n’est plus visible que de toi.',
    'Explication : ce commentaire insulte un membre.',
  ]
  const SUBJECT = fr.t(($) => $.removal.contestSubject, {
    decision: fr.t(($) => $.removal.contestDecision.comment, { title: 'Météo' }),
    date: '12 nov.',
  })

  let openURL: jest.SpyInstance
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    openURL.mockClear()
  })
  afterEach(() => openURL.mockRestore())

  const show = (contest?: { subject: string }) =>
    renderWithProviders(
      <RemovalNotice title={banner.title} lines={lines} {...(contest ? { contest } : null)} />,
    )
  const group = () => noticeGroup(banner.title)

  /** Le lien qui ouvre la messagerie, nommé par l'adresse ou par « Contester ». */
  const contactLink = () =>
    within(group())
      .queryAllByRole('link')
      .find((link) => {
        const name = String(link.props.accessibilityLabel ?? '')
        return name === contactEmail || name === fr.t(($) => $.notifications.contest)
      })

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

  it('writes the contact address in full, in the group', async () => {
    await show({ subject: SUBJECT })

    // L'adresse se lit et se recopie, même sans appli de messagerie.
    expect(within(group()).queryAllByText(containing(contactEmail)).length).toBeGreaterThan(0)
  })

  it('opens the contact address with the decision in the subject', async () => {
    await show({ subject: SUBJECT })

    const link = contactLink()
    if (!link) throw new Error('no contact link in the removal notice')
    await fireEvent.press(link)

    const url = String(openURL.mock.calls.at(-1)?.[0] ?? '')
    expect(url.startsWith(`mailto:${contactEmail}?subject=`)).toBe(true)
    expect(decodeURIComponent(url.split('?subject=')[1] ?? '')).toBe(SUBJECT)
  })

  it('puts the title first, then the sentences, and « Pour contester » last', async () => {
    await show({ subject: SUBJECT })

    const title = within(group()).getByText(banner.title)
    const [first, last] = lines.map((line) => within(group()).getByText(line))
    const link = contactLink()
    if (!link) throw new Error('no contact link in the removal notice')
    const places = [title, first, last, link].map(readingOrder)
    expect(places.every((place) => place >= 0)).toBe(true)
    expect([...places].sort((a, b) => a - b)).toEqual(places)
  })

  it('offers no contact link without contest', async () => {
    await show()

    // Témoin : le groupe et ses phrases sont là.
    expect(within(group()).getByText(lines[0] ?? '')).toBeTruthy()
    expect(within(group()).queryAllByRole('link')).toHaveLength(0)
  })
})

describe('removalBanner', () => {
  const removal: Removal = {
    ground: 'illegal',
    explanation: 'Publier de faux avis est interdit.',
    at: '2026-10-20T09:00:00.000Z',
    afterReport: false,
  }

  it('says who decided, on what ground, why, and how to contest, without a report', () => {
    const { title, lines } = removalBanner(removal, fr.t)

    expect(title).toBe(fr.t(($) => $.removal.banner))
    expect(lines).toEqual([
      fr.t(($) => $.removal.onlyYou),
      fr.t(($) => $.removal.direct),
      fr.t(($) => $.removal.grounds.illegal),
      fr.t(($) => $.removal.explanation, { explanation: removal.explanation }),
      fr.t(($) => $.removal.contest),
    ])
  })

  it('says when a report came first, never by whom', () => {
    const { lines } = removalBanner({ ...removal, afterReport: true, ground: 'rules' }, fr.t)

    expect(lines).toContain(fr.t(($) => $.removal.afterReport))
    expect(lines).toContain(fr.t(($) => $.removal.grounds.rules))
    expect(lines).not.toContain(fr.t(($) => $.removal.direct))
  })

  it('writes the explanation as typed, characters included', () => {
    const { lines } = removalBanner({ ...removal, explanation: 'Pas de <script> & co.' }, fr.t)

    expect(lines).toContain('Explication : Pas de <script> & co.'.replace(' :', ' :'))
  })
})
