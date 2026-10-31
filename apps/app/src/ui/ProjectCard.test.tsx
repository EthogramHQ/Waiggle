// Tests de l'emplacement `overlay` de la carte d'un projet (refonte, tranche R3, « Suivre l'auteur
// depuis une carte ») : ce qu'on pose sur la photo (la pastille « Suivre Nora » d'Explorer) est
// rendu à côté du lien de la carte, jamais dedans. Un interrupteur dans un lien serait ambigu pour
// les lecteurs d'écran (lu comme une partie du lien, ou pas atteint du tout) et, sur le web, un
// élément interactif dans un <a> n'est pas permis (relecture de l'interface du plan, ui-4).
//
// Les tests d'avant R3 (lien nommé d'après le projet, « Tester » jamais dans un lien) restent dans
// components.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FollowButton } from './FollowButton'
import { ProjectCard } from './ProjectCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

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
