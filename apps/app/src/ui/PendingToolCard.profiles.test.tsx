// Tests de la carte d'un « Autre » cité par des profils (décision de Louis du 9/11/2026 au soir,
// relecture juridique jur-J1) : un nom hors catalogue mis dans ses outils favoris est relu comme
// celui d'un projet. La carte dit combien de projets et de profils le citent (« Cité par 2 profils »,
// « Cité par 2 projets et 3 profils »), puis, sous les projets, les membres qui l'ont choisi
// (« Profil d'Inès Moreau »). L'appli n'a de page de membre que par identifiant, que `PendingTool`
// ne donne pas : les profils se lisent en texte simple, jamais en lien.
import { nameOf } from '@ruche/i18n'
import { screen } from '@testing-library/react-native'
import { gammaPending, makeComPending, napkinPending } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PendingToolCard } from './PendingToolCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const handlers = () => ({
  onAdmit: jest.fn(),
  onMerge: jest.fn(),
  onDismiss: jest.fn(),
  onOpenProject: jest.fn(),
})

/** « Profil d’Inès Moreau », « Profil de Yann Le Gall » : un membre de la carte, tel qu'il se lit. */
const profileLine = (name: string) =>
  fr.t(($) => $.moderation.catalogue.profileOf, { nameOf: nameOf('fr', name) })

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: (Host | string)[] }

/**
 * Les listes de la carte, dans l'ordre, chacune par le texte de ses éléments. `getByRole` ne voit
 * que les vues `accessible` (charte) : on parcourt l'arbre et on lit le rôle posé.
 */
const listsOf = (): string[][] => {
  const textOf = (node: Host | string): string =>
    typeof node === 'string' ? node : node.children.map(textOf).join('')
  const found: string[][] = []
  const walk = (node: Host | string) => {
    if (typeof node === 'string') return
    if (node.props.role === 'list') {
      found.push(node.children.map(textOf))
      return
    }
    node.children.forEach(walk)
  }
  walk(screen.root as unknown as Host)
  return found
}

describe('PendingToolCard, the profiles of an « other » tool', () => {
  it('shows the members who chose an « other » tool as a favourite on its card', async () => {
    await renderWithProviders(
      <PendingToolCard tool={napkinPending} outcome={null} {...handlers()} />,
    )

    // « par » ne s'élide pas, mais « de » oui : « Profil d’Inès Moreau », « Profil de Yann Le Gall ».
    expect(screen.getByText('Profil d’Inès Moreau')).toBeTruthy()
    expect(screen.getByText(profileLine('Yann Le Gall'))).toBeTruthy()
    // Du texte simple : ni lien, ni bouton (aucune page de membre par pseudo).
    expect(screen.queryByRole('link', { name: profileLine('Inès Moreau') })).toBeNull()
    expect(screen.queryByRole('button', { name: profileLine('Inès Moreau') })).toBeNull()
    // Les profils forment une liste à eux ; aucun projet ici : pas de liste vide des projets.
    const lists = listsOf()
    expect(lists).toHaveLength(1)
    expect(lists[0]).toEqual(napkinPending.profiles.map((member) => profileLine(member.name)))
  })

  it('lists the projects, then the profiles', async () => {
    await renderWithProviders(
      <PendingToolCard tool={gammaPending} outcome={null} {...handlers()} />,
    )

    const [projects, profiles] = listsOf()
    expect(projects).toHaveLength(gammaPending.projects.length)
    expect(profiles).toEqual(gammaPending.profiles.map((member) => profileLine(member.name)))
    for (const member of gammaPending.profiles) {
      expect(screen.getByText(profileLine(member.name))).toBeTruthy()
    }
  })

  it.each([
    ['projects only', makeComPending, 'Cité par 3 projets'],
    ['profiles only', napkinPending, 'Cité par 2 profils'],
    ['both', gammaPending, 'Cité par 2 projets et 3 profils'],
  ])(
    'counts the projects and the profiles of an « other » tool (%s)',
    async (_case, tool, count) => {
      await renderWithProviders(<PendingToolCard tool={tool} outcome={null} {...handlers()} />)

      expect(screen.getByText(count)).toBeTruthy()
    },
  )

  it('says « Cité par 1 profil » in the singular', async () => {
    const one = { ...napkinPending, profileCount: 1, profiles: napkinPending.profiles.slice(0, 1) }
    await renderWithProviders(<PendingToolCard tool={one} outcome={null} {...handlers()} />)

    expect(screen.getByText('Cité par 1 profil')).toBeTruthy()
  })
})
