// Tests de la marque `data-cover-panel` des cartes à photo pleine (relecture du design de R17, C2,
// 18/11/2026). Pendant un passage, la photo d'une carte vole au-dessus de tout ; or elle remplit la
// carte, sous son texte : au retour, elle se repliait par-dessus l'auteur, le titre et « Tester », et
// la carte revenait vide. Le moteur des passages (ui/pageTransition.web.ts) nomme donc aussi la carte
// autour de la photo, qu'il trouve par cette marque (`closest('[data-cover-panel]')`) : la vue marquée
// doit contenir la photo, le lien de la carte et ses rangées. Jest ne joue aucun passage : on vérifie
// la marque et ce qu'elle contient ; le vol se regarde dans le navigateur (essai `film2.mjs`).
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectCard } from './ProjectCard'
import { ShowcaseCard } from './ShowcaseCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const marked = () =>
  hostsOf(screen.root as unknown as Node).filter(
    (node) => (node.props.dataSet as Record<string, unknown> | undefined)?.coverPanel !== undefined,
  )
/** Vrai si `node` contient l'image de cette adresse (la photo de la carte). */
const holdsPhoto = (node: Node, uri: string) =>
  hostsOf(node).some((host) => JSON.stringify(host.props.source ?? null).includes(uri))
const holds = (node: Node, inner: unknown) => hostsOf(node).includes(inner as Node)

const photo = 'https://api.example/aloe.webp'
const projectCard = (
  <ProjectCard
    title="Arrosage malin"
    pitch="Le jardin dit quand il a soif."
    author={{ name: 'Nora Benali', avatar: null, onPress: () => {} }}
    when="il y a 3 h"
    status={{ label: 'En construction', strong: false }}
    image={{ source: { uri: photo }, label: 'Un arrosoir au soleil' }}
    tryIt={{ label: 'Tester', onPress: () => {} }}
    onPress={() => {}}
  />
)
const showcaseCard = (
  <ShowcaseCard
    title="Décollage !"
    author={{ name: 'Papi Jean', avatar: null }}
    image={{ source: { uri: photo }, label: 'Décollage !' }}
    status={{ label: 'Testable', strong: true }}
    onPress={() => {}}
    coverId="p1"
  />
)

describe('the card around its flying photo (R17, C2)', () => {
  it('marks the project card around its photo, its link, its author and « Tester », on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(projectCard)

    const [card, ...others] = marked()
    expect(others).toEqual([])
    if (!card) throw new Error('no card marked')
    expect(holdsPhoto(card, photo)).toBe(true)
    expect(holds(card, screen.getByRole('link', { name: 'Arrosage malin' }))).toBe(true)
    expect(holds(card, screen.getByRole('link', { name: 'Nora Benali' }))).toBe(true)
    expect(holds(card, screen.getByRole('link', { name: /Tester/ }))).toBe(true)
  })

  it('marks the showcase card around its photo and its link, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(showcaseCard)

    const [card, ...others] = marked()
    expect(others).toEqual([])
    if (!card) throw new Error('no card marked')
    expect(holdsPhoto(card, photo)).toBe(true)
    expect(holds(card, screen.getByText('Décollage !'))).toBe(true)
    expect(holds(card, screen.getByText('Papi Jean'))).toBe(true)
  })

  // Témoin : hors du web, aucun passage, aucune marque.
  it('marks nothing on a phone', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await renderWithProviders(projectCard)

    expect(marked()).toEqual([])
  })
})
