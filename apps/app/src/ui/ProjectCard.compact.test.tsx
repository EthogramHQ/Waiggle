// Tests de la carte compacte d'un projet et de la carte sans auteur (tranche R14, docs/scenarios/
// refonte.md, « La mosaïque ») : sur la page d'un membre, les projets qui suivent le plus récent
// sont des cartes plus petites (`size="compact"`) : photo plein cadre, titre, statut et réactions ;
// sans photo, la lumière miel avec l'accroche sur deux lignes. Ni catégorie, ni « Tester », ni la
// ligne d'une mise à jour (son repère seul). Et aucune carte ne répète le nom du membre : on est sur
// sa page (`author` absent), et le verre ne lui garde aucune place.
//
// L'interface attendue (plan R14, choix 6) : `ProjectCard` gagne `size?: 'full' | 'compact'`
// (`full` par défaut, la carte du Fil) et `author` devient facultatif. La carte compacte fait 230
// points de haut au moins, et grandit avec le texte agrandi.
import { layout } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import { categoryName } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PROJECT_CARD_HEIGHT, ProjectCard } from './ProjectCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = {
  props: Record<string, unknown>
  parent: Node | null
  children: ReadonlyArray<Node | string>
}

const HIDDEN_TOO = { includeHiddenElements: true }

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const card = {
  title: 'Biscotte au parc',
  pitch: 'Le carnet des promenades du chien, avec la météo du jour.',
  author: { name: 'Tante Odile', avatar: null },
  when: 'il y a 5 jours',
  status: { label: 'En construction', strong: false },
  image: { source: { uri: 'https://api.example/biscotte.webp' }, label: 'Biscotte au parc' },
  category: { label: categoryName('animals'), icon: 'paw-print' as const },
  reactionTotal: 4,
}
const tryIt = { label: fr.t(($) => $.explore.test), onPress: () => {} }
const testName = fr.t(($) => $.explore.testProject, { title: card.title })

const styleOf = (node: Node | null | undefined) =>
  (StyleSheet.flatten(node?.props.style as ViewStyle) ?? {}) as ViewStyle

/** Le premier ancêtre (lui compris) qui répond à `test`. */
const closest = (node: Node, test: (node: Node) => boolean): Node | null => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (test(current)) return current
  }
  return null
}

/** La vue qui porte la photo et le verre : celle qui a la hauteur minimale de la carte. */
const body = () => {
  const title = screen.getByText(card.title, HIDDEN_TOO) as unknown as Node
  return closest(title, (node) => Number(styleOf(node).minHeight ?? 0) > 0)
}

/**
 * La place prise dans le verre au-dessus du titre : la hauteur des vues posées avant lui, dans le
 * flux (les calques en `position: absolute` n'en prennent pas), de son parent jusqu'à la carte.
 */
const roomAboveTitle = () => {
  const title = screen.getByText(card.title, HIDDEN_TOO) as unknown as Node
  const top = body()
  let room = 0
  for (let node: Node = title; node.parent && node !== top; node = node.parent) {
    const siblings = node.parent.children.filter(
      (child): child is Node => typeof child !== 'string',
    )
    for (const sibling of siblings.slice(0, siblings.indexOf(node))) {
      const style = styleOf(sibling)
      if (style.position === 'absolute') continue
      room += Math.max(Number(style.height ?? 0), Number(style.minHeight ?? 0))
    }
  }
  return room
}

describe('ProjectCard without an author (R14)', () => {
  it('shows no author row when there is no author', async () => {
    const { author: _author, ...withoutAuthor } = card
    await renderWithProviders(<ProjectCard {...withoutAuthor} onPress={() => {}} />)

    expect(screen.getByRole('link', { name: card.title })).toBeTruthy() // témoin : la carte est là
    expect(screen.queryByText(card.author.name, HIDDEN_TOO)).toBeNull()
    expect(screen.queryByRole('link', { name: card.author.name })).toBeNull()
    expect(screen.queryByText(card.when, HIDDEN_TOO)).toBeNull()
  })

  it('keeps no room for the author row in the glass when there is no author', async () => {
    // Témoin : avec un auteur, le verre lui garde la hauteur d'une zone à toucher.
    const view = await renderWithProviders(<ProjectCard {...card} onPress={() => {}} />)
    expect(roomAboveTitle()).toBeGreaterThanOrEqual(layout.touchTarget)
    await view.unmount()

    const { author: _author, ...withoutAuthor } = card
    await renderWithProviders(<ProjectCard {...withoutAuthor} onPress={() => {}} />)

    expect(roomAboveTitle()).toBe(0)
  })
})

describe('ProjectCard, compact (R14)', () => {
  it('shows the title, the status and the reactions', async () => {
    await renderWithProviders(
      <ProjectCard {...card} size="compact" tryIt={tryIt} onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: card.title })).toBeTruthy()
    expect(screen.getByText(card.status.label)).toBeTruthy()
    const reactions = plain(fr.t(($) => $.card.reactions, { count: card.reactionTotal }))
    expect(screen.getByLabelText(reactions)).toBeTruthy()
  })

  it('shows no pitch over a photo', async () => {
    await renderWithProviders(<ProjectCard {...card} size="compact" onPress={() => {}} />)

    expect(screen.getByText(card.title)).toBeTruthy() // témoin
    expect(screen.queryByText(card.pitch, HIDDEN_TOO)).toBeNull()
  })

  it('shows the pitch on two lines without a photo', async () => {
    await renderWithProviders(
      <ProjectCard {...card} image={null} size="compact" onPress={() => {}} />,
    )

    const pitch = screen.getByText(card.pitch)
    expect(pitch.props.numberOfLines).toBe(2)
  })

  it('shows neither the category nor « Tester »', async () => {
    await renderWithProviders(
      <ProjectCard {...card} size="compact" tryIt={tryIt} onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: card.title })).toBeTruthy() // témoin
    expect(screen.queryByText(card.category.label, HIDDEN_TOO)).toBeNull()
    expect(screen.queryByRole('link', { name: testName })).toBeNull()
    expect(screen.queryByText(tryIt.label, HIDDEN_TOO)).toBeNull()
  })

  it('shows the « Mis à jour » mark alone, not the line of the update', async () => {
    const line = 'Un compte à rebours avant chaque promenade.'
    await renderWithProviders(
      <ProjectCard
        {...card}
        size="compact"
        updated={{
          kind: 'full',
          label: 'Mis à jour · v1.2',
          line: { family: 'new', text: line },
          more: 'et 2 autres changements',
          at: '2026-10-20T08:00:00.000Z',
        }}
        onPress={() => {}}
      />,
    )

    expect(screen.getByText('Mis à jour · v1.2')).toBeTruthy()
    expect(screen.queryByText(line, HIDDEN_TOO)).toBeNull()
    expect(screen.queryByText('et 2 autres changements', HIDDEN_TOO)).toBeNull()
  })

  it('keeps the visibility and « Exemple » marks', async () => {
    await renderWithProviders(
      <ProjectCard {...card} size="compact" badge="Réservé à Famille" example onPress={() => {}} />,
    )

    expect(screen.getByText('Réservé à Famille')).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.common.example))).toBeTruthy()
  })

  it('is lower than the feed card, 230 points at least', async () => {
    await renderWithProviders(<ProjectCard {...card} size="compact" onPress={() => {}} />)

    const minHeight = Number(styleOf(body()).minHeight)
    expect(minHeight).toBeGreaterThanOrEqual(230)
    expect(minHeight).toBeLessThan(PROJECT_CARD_HEIGHT)
  })

  // Le texte agrandi fait grandir la carte au lieu de rogner son verre : une hauteur minimale,
  // jamais une hauteur fixe, et la photo suit la hauteur mesurée.
  it('grows with larger text instead of clipping its glass', async () => {
    await renderWithProviders(<ProjectCard {...card} size="compact" onPress={() => {}} />)

    const frame = body()
    expect(Number(styleOf(frame).minHeight)).toBeGreaterThan(0) // témoin : la carte est trouvée
    expect(styleOf(frame).height).toBeUndefined()
    await fireEvent(frame as never, 'layout', { nativeEvent: { layout: { height: 420 } } })
    expect(styleOf(body()).height).toBeUndefined()
  })

  it('opens the project from the whole card', async () => {
    const open = jest.fn()
    await renderWithProviders(<ProjectCard {...card} size="compact" onPress={open} />)

    await fireEvent.press(screen.getByRole('link', { name: card.title }))
    expect(open).toHaveBeenCalledTimes(1)
  })
})
