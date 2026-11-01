// Tests de l'emplacement `overlay` de la carte d'un projet (refonte, tranche R3, « Suivre l'auteur
// depuis une carte ») : ce qu'on pose sur la photo (la pastille « Suivre Nora » d'Explorer) est
// rendu à côté du lien de la carte, jamais dedans. Un interrupteur dans un lien serait ambigu pour
// les lecteurs d'écran (lu comme une partie du lien, ou pas atteint du tout) et, sur le web, un
// élément interactif dans un <a> n'est pas permis (relecture de l'interface du plan, ui-4).
//
// Les tests d'avant R3 (lien nommé d'après le projet, « Tester » jamais dans un lien) restent dans
// components.test.tsx.
//
// R4 (décision F-Fil2, relectures de l'interface ui-B1 et de sécurité sec-A7) : la carte du fil.
// Le panneau de verre sort du lien de la carte : trois liens frères, lus dans l'ordre auteur →
// projet → « Tester » ; la date, le statut et le total des réactions (« ✦ 49 », lu « 49
// réactions ») sont du texte hors de tout lien. « Tester » est là même quand la carte est un lien,
// annoncé comme un site externe, et passe par la page d'avertissement `/out` (`SummaryCard`, qui
// prépare la carte d'un résumé de projet, est testée ici avec elle).
import { layout } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Linking, Platform, StyleSheet } from 'react-native'
import { SummaryCard } from '../projects/SummaryCard'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FollowButton } from './FollowButton'
import { ProjectCard } from './ProjectCard'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Le routeur, pour `SummaryCard` : on note les pages demandées (push ou navigate, peu importe).
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, navigate: mockPush }),
}))

const card = {
  title: 'Carnet de cafés',
  pitch: 'Note chaque café goûté, et retrouve ceux qui t’ont plu.',
  author: { name: 'Nora Benali', avatar: null },
  when: 'il y a 2 jours',
  status: { label: 'En test', strong: true },
}

const follow = fr.t(($) => $.follow.member, { name: 'Nora' })

/** La pastille comme Explorer la pose sur la photo. */
const chip = (onPress: () => void) => (
  <FollowButton variant="chip" followed={false} label={follow} text={follow} onPress={onPress} />
)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null }

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

describe('ProjectCard, with something laid on its photo', () => {
  it('keeps the follow chip outside the link of the card', async () => {
    await renderWithProviders(<ProjectCard {...card} onPress={() => {}} overlay={chip(() => {})} />)

    const followChip = screen.getByRole('switch', { name: follow })
    // On remonte de la pastille jusqu'en haut de l'arbre : aucun ancêtre n'est un lien (ni un
    // bouton, qui poserait le même problème).
    let parent = (followChip as unknown as Node).parent
    while (parent) {
      expect(['link', 'button']).not.toContain(roleOf(parent.props))
      parent = parent.parent
    }
    // Et la carte reste un lien, nommé d'après le projet seul (la pastille n'entre pas dans son nom).
    expect(screen.getByRole('link', { name: card.title })).toBeTruthy()
  })

  it('follows the author without opening the project when the chip is touched', async () => {
    const open = jest.fn()
    const followAuthor = jest.fn()
    await renderWithProviders(<ProjectCard {...card} onPress={open} overlay={chip(followAuthor)} />)

    await fireEvent.press(screen.getByRole('switch', { name: follow }))

    expect(followAuthor).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('still opens the project from the card that carries a chip', async () => {
    const open = jest.fn()
    const followAuthor = jest.fn()
    await renderWithProviders(<ProjectCard {...card} onPress={open} overlay={chip(followAuthor)} />)

    await fireEvent.press(screen.getByRole('link', { name: card.title }))

    expect(open).toHaveBeenCalledTimes(1)
    expect(followAuthor).not.toHaveBeenCalled()
  })

  // Témoin : sans rien sur la photo, la carte est celle d'avant R3 (un lien, aucun interrupteur),
  // ce qui prouve aussi que les tests ci-dessus trouvent bien la pastille qu'on y a posée.
  it('stays the same card without an overlay', async () => {
    const open = jest.fn()
    await renderWithProviders(<ProjectCard {...card} onPress={open} />)

    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText(card.title)).toBeTruthy()
    expect(screen.getByText(card.author.name)).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: card.title }))
    expect(open).toHaveBeenCalledTimes(1)
  })
})

// --- R4 : la carte du fil -----------------------------------------------------------------------

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const testName = fr.t(($) => $.explore.testProject, { title: card.title })
const outside = fr.t(($) => $.common.externalSite)
const total = (count: number) => plain(fr.t(($) => $.card.reactions, { count }))

/** Une carte du fil complète : l'auteur mène à sa page, « Tester » à la démo, 49 réactions. */
const feedCard = (
  handlers: { open?: () => void; test?: () => void; openAuthor?: () => void } = {},
  reactionTotal = 49,
) => (
  <ProjectCard
    {...card}
    author={{ ...card.author, onPress: handlers.openAuthor ?? (() => {}) }}
    tryIt={{ label: fr.t(($) => $.explore.test), onPress: handlers.test ?? (() => {}) }}
    reactionTotal={reactionTotal}
    onPress={handlers.open ?? (() => {})}
  />
)

const projectLink = () => screen.getByRole('link', { name: card.title })
const authorLink = () => screen.getByRole('link', { name: card.author.name })
const testLink = () => screen.getByRole('link', { name: testName })

/** Ce qui se lit sous ce nom : un élément nommé ainsi, ou un texte (masqué) qui le dit. */
const readAs = (name: string) =>
  screen.queryByLabelText(name) ?? screen.queryByText(plain(name), { exact: true })

/** Vrai si un ancêtre de l'élément est un lien ou un bouton. */
const insideControl = (element: unknown): boolean => {
  let parent = (element as Node).parent
  while (parent) {
    if (['link', 'button'].includes(String(roleOf(parent.props)))) return true
    parent = parent.parent
  }
  return false
}

/** La zone à toucher d'un élément : au moins 44 points de haut et de large. */
const touchSize = (element: unknown) => {
  const style = StyleSheet.flatten((element as Node).props.style as object) ?? {}
  const { minHeight, height, minWidth, width } = style as Record<string, unknown>
  return {
    height: Math.max(Number(minHeight ?? 0), Number(height ?? 0)),
    width: Math.max(Number(minWidth ?? 0), Number(width ?? 0)),
  }
}

describe('ProjectCard in the feed, its links (ui-B1)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('offers three sibling links: author, project, Tester', async () => {
    await renderWithProviders(feedCard())

    expect(authorLink()).toBeTruthy()
    expect(projectLink()).toBeTruthy()
    expect(testLink()).toBeTruthy()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('nests no link inside the card link', async () => {
    await renderWithProviders(feedCard())

    expect(insideControl(authorLink())).toBe(false)
    expect(insideControl(projectLink())).toBe(false)
    expect(insideControl(testLink())).toBe(false)
  })

  it('reads the date, the status and 49 réactions outside the card link', async () => {
    await renderWithProviders(feedCard())

    const date = screen.getByText(card.when, { includeHiddenElements: true })
    const status = screen.getByText(card.status.label, { includeHiddenElements: true })
    const reactions = readAs(total(49))
    expect(reactions).not.toBeNull()
    expect(insideControl(date)).toBe(false)
    expect(insideControl(status)).toBe(false)
    expect(insideControl(reactions)).toBe(false)
  })

  it('orders the links as read: author, project, Tester', async () => {
    await renderWithProviders(feedCard())

    const links = screen.getAllByRole('link')
    // On compare des positions, pas des éléments : un écart entre deux éléments s'écrirait sans fin.
    expect(links.indexOf(authorLink())).toBe(0)
    expect(links.indexOf(projectLink())).toBe(1)
    expect(links.indexOf(testLink())).toBe(2)
  })

  it('opens once on a double tap across its links', async () => {
    const open = jest.fn()
    const test = jest.fn()
    const openAuthor = jest.fn()
    await renderWithProviders(feedCard({ open, test, openAuthor }))

    // « Tester », puis la seconde tape d'une double tape qui tombe à côté, sur la carte, puis sur
    // l'auteur : une seule page s'ouvre.
    await fireEvent.press(testLink())
    await fireEvent.press(projectLink())
    await fireEvent.press(authorLink())
    expect(test).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    expect(openAuthor).not.toHaveBeenCalled()

    // Passé la garde, la carte s'ouvre ; deux tapes ne l'ouvrent qu'une fois.
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(projectLink())
    await fireEvent.press(projectLink())
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('offers « Tester » even when the whole card is a link', async () => {
    const test = jest.fn()
    const open = jest.fn()
    await renderWithProviders(feedCard({ test, open }))

    await fireEvent.press(testLink())

    expect(test).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('announces « Tester » as an external site', async () => {
    await renderWithProviders(feedCard())

    // Sur téléphone, l'indice lu après le nom ; sur le web, le nom le dit (test suivant).
    expect(testLink()).toHaveProp('accessibilityHint', outside)
  })

  it('says in the name of « Tester » that it opens an external site, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(feedCard())

      expect(screen.getByRole('link', { name: `${testName}, ${outside}` })).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('leads to the page of the author from her name', async () => {
    const openAuthor = jest.fn()
    const open = jest.fn()
    await renderWithProviders(feedCard({ openAuthor, open }))

    await fireEvent.press(authorLink())

    expect(openAuthor).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('gives the author link and « Tester » 44 points to touch', async () => {
    await renderWithProviders(feedCard())

    for (const link of [authorLink(), testLink()]) {
      expect(touchSize(link).height).toBeGreaterThanOrEqual(layout.touchTarget)
      expect(touchSize(link).width).toBeGreaterThanOrEqual(layout.touchTarget)
    }
  })
})

describe('ProjectCard in the feed, its reactions', () => {
  it('reads the total as 49 réactions', async () => {
    await renderWithProviders(feedCard())

    expect(readAs(total(49))).not.toBeNull()
  })

  it('reads a single reaction in the singular', async () => {
    await renderWithProviders(feedCard({}, 1))

    expect(readAs(total(1))).not.toBeNull()
  })

  it('shows no total at 0', async () => {
    await renderWithProviders(feedCard({}, 0))

    // Témoin : la carte est bien là, avec sa date.
    expect(screen.getByText(card.when, { includeHiddenElements: true })).toBeTruthy()
    expect(readAs(total(0))).toBeNull()
    expect(screen.queryByText(/réaction/, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByLabelText(/réaction/)).toBeNull()
  })

  it('hides the drawn total from screen readers on the web, and writes 49 réactions for them', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(feedCard())

      // Le texte « 49 réactions » est lu (masqué à l'œil), le « 49 » dessiné à côté de l'étincelle
      // ne l'est pas : un nom posé sur un texte sans rôle n'est pas lu sur le web (ui-B3).
      expect(screen.getByText(total(49))).toBeTruthy()
      expect(screen.queryByText('49')).toBeNull()
      expect(screen.getByText('49', { includeHiddenElements: true })).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('SummaryCard, the feed card of a project summary', () => {
  const project = { ...summaryOf(recipesProject), reactionTotal: 49 }
  const name = fr.t(($) => $.explore.testProject, { title: project.title })

  beforeEach(() => {
    mockPush.mockClear()
    mockSession({ user: { id: 'u2', name: 'Inès' } })
  })

  it('sends « Tester » through the /out warning page, never straight to the demo', async () => {
    const openURL = jest.spyOn(Linking, 'openURL')
    try {
      await renderWithProviders(<SummaryCard project={project} />)

      await fireEvent.press(screen.getByRole('link', { name }))

      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/out',
        params: { url: project.demoUrl },
      })
      expect(openURL).not.toHaveBeenCalled()
    } finally {
      openURL.mockRestore()
    }
  })

  it('offers no « Tester » without a demo', async () => {
    await renderWithProviders(<SummaryCard project={{ ...project, demoUrl: null }} />)

    // Témoin : la carte est là, et son lien.
    expect(screen.getByRole('link', { name: project.title })).toBeTruthy()
    expect(screen.queryByRole('link', { name })).toBeNull()
  })

  it('leads to the page of the author', async () => {
    await renderWithProviders(<SummaryCard project={project} />)

    await fireEvent.press(screen.getByRole('link', { name: project.author.name }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/members/[id]',
      params: { id: project.author.id },
    })
  })

  it('reads the reaction total of the summary', async () => {
    await renderWithProviders(<SummaryCard project={project} />)

    expect(readAs(total(49))).not.toBeNull()
  })
})
