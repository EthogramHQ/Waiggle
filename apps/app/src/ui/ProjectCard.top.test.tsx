// Tests de la colonne du haut de la photo d'une carte (R6a) : la catégorie, puis la pastille
// « Suivre » dessous. À texte agrandi sur une carte basse, le panneau de verre du bas montait sous
// cette colonne (essai à 320 px et 200 % : « Suivre Nora » posé sur le nom de l'auteur). La carte
// réserve donc, en haut, la hauteur mesurée de la colonne : le verre ne monte jamais plus haut, et la
// carte grandit à la place (relecture de design R3, C2, et liste de contrôle de `design.md`).
import { space } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import { CATEGORY_ICONS } from '../projects/categories'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FollowButton } from './FollowButton'
import { ProjectCard } from './ProjectCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null }

const follow = fr.t(($) => $.follow.member, { name: 'Nora' })
const card = {
  title: 'Le ciel de ce soir',
  pitch: 'Ce qu’on verra dans le ciel ce soir, s’il fait beau.',
  author: { name: 'Nora Benali', avatar: null },
  when: 'il y a 3 h',
  status: { label: 'Testable', strong: true },
  image: { source: { uri: 'https://api.example/ciel.webp' }, label: 'Le ciel au crépuscule' },
  category: { label: fr.t(($) => $.project.category.science), icon: CATEGORY_ICONS.science },
}

/** Le premier ancêtre (lui compris) qui répond à `test`. */
const closest = (node: Node, test: (props: Record<string, unknown>) => boolean): Node | null => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (test(current.props)) return current
  }
  return null
}

/** Le `paddingTop` de la vue qui porte le verre (celle qui a la hauteur minimale de la carte). */
const panelTop = () => {
  const title = screen.getByText(card.title, { includeHiddenElements: true }) as unknown as Node
  const styleOf = (props: Record<string, unknown> | undefined) =>
    (StyleSheet.flatten(props?.style as ViewStyle) ?? {}) as ViewStyle
  const body = closest(title, (props) => Number(styleOf(props).minHeight ?? 0) > 0)
  return styleOf(body?.props).paddingTop as number
}

describe('ProjectCard, the column at the top of its photo (R6a)', () => {
  it('keeps the glass panel below the category and the follow chip', async () => {
    await renderWithProviders(
      <ProjectCard
        {...card}
        onPress={() => {}}
        overlay={
          <FollowButton
            variant="chip"
            followed={false}
            label={follow}
            text={follow}
            onPress={() => {}}
          />
        }
      />,
    )
    const before = panelTop()

    // La colonne mesure 100 points (étiquette et pastille, texte agrandi).
    const chip = screen.getByRole('switch', { name: follow }) as unknown as Node
    const column = closest(chip, (props) => typeof props.onLayout === 'function')
    expect(column).not.toBeNull()
    await fireEvent(column as never, 'layout', { nativeEvent: { layout: { height: 100 } } })

    // Le verre commence sous la colonne, un écart de rangée plus bas.
    expect(panelTop()).toBe(before + 100 + space.sm)
  })

  it('reserves nothing at the top without a category on the photo nor an overlay', async () => {
    await renderWithProviders(<ProjectCard {...card} image={null} onPress={() => {}} />)

    // Sans photo, la catégorie est dans le verre : pas de colonne en haut, la marge seule.
    expect(panelTop()).toBe(space.sm)
  })
})
