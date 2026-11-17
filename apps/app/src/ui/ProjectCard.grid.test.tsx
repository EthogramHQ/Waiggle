// Tests de la carte d'un projet posée dans une grille de compactes (relecture de design de R15,
// planche R15-Explorer-1920) : sous `GridCardsContext` à `compact` (« Récents » d'Explorer), une
// carte sans taille donnée devient, sur ordinateur, la compacte de la mosaïque : ni « Tester », ni
// catégorie, ni accroche sur une photo ; l'auteur, la pastille posée dessus (« Suivre Nora ») et le
// statut restent. Sur téléphone, « Récents » garde ses grandes cartes, « Tester » compris. Une
// taille donnée par l'écran l'emporte toujours.
import { act, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectCard } from './ProjectCard'
import { GridCardsContext } from './ProjectGrid'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const card = {
  title: 'Arrosage malin',
  pitch: 'Le jardin dit quand il a soif.',
  author: { name: 'Nora Benali', avatar: null },
  when: 'il y a 3 h',
  status: { label: 'En construction', strong: false },
  image: { source: { uri: 'https://api.example/aloe.webp' }, label: 'Arrosage malin' },
  reactionTotal: 18,
}
const tryIt = { label: fr.t(($) => $.explore.test), onPress: () => {} }
const testName = fr.t(($) => $.explore.testProject, { title: card.title })
const CHIP = 'Suivre Nora'

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
const setWindow = (width: number, height: number) => {
  const size = { width, height, scale: 2, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
}

const inCompactGrid = (size?: 'full' | 'compact') => (
  <GridCardsContext.Provider value="compact">
    <ProjectCard
      {...card}
      {...(size ? { size } : null)}
      tryIt={tryIt}
      onPress={() => {}}
      overlay={<Text>{CHIP}</Text>}
    />
  </GridCardsContext.Provider>
)

afterEach(async () => {
  await act(async () => Dimensions.set({ window: phone, screen: phone }))
})

it('ProjectCard becomes the compact card in a compact grid on a computer', async () => {
  setWindow(1920, 940)
  await renderWithProviders(inCompactGrid())

  // La compacte : ni « Tester » ni accroche sur la photo.
  expect(screen.queryByRole('link', { name: testName })).toBeNull()
  expect(screen.queryByText(card.pitch)).toBeNull()
  // Ce qu'elle garde dans Explorer : le lien du projet, l'auteur, la pastille et le statut.
  expect(screen.getByRole('link', { name: card.title })).toBeTruthy()
  expect(screen.getByText(card.author.name)).toBeTruthy()
  expect(screen.getByText(CHIP)).toBeTruthy()
  expect(screen.getByText(card.status.label)).toBeTruthy()
})

// Les compactes d'une rangée prennent la hauteur de la plus haute (sa case l'offre, `ProjectGrid`) :
// la carte grandit avec sa case, comme dans la mosaïque. Jest ne calcule aucune hauteur : on lit
// la croissance (`flexGrow`) des vues autour du titre.
type Node = { props: Record<string, unknown>; parent: Node | null }
const growsWithItsCell = () => {
  for (let node = screen.getByText(card.title) as unknown as Node | null; node; ) {
    const style = StyleSheet.flatten(node.props.style as never) as { flexGrow?: number } | undefined
    if (style?.flexGrow === 1) return true
    node = node.parent
  }
  return false
}

it('stretches the compact card of a grid to the height of its row', async () => {
  setWindow(1920, 940)
  await renderWithProviders(inCompactGrid())
  expect(growsWithItsCell()).toBe(true)
})

it('does not stretch the large card of the feed', async () => {
  setWindow(1920, 940)
  await renderWithProviders(inCompactGrid('full'))
  expect(growsWithItsCell()).toBe(false)
})

it('keeps the large card with Tester in a compact grid on a phone', async () => {
  await renderWithProviders(inCompactGrid())

  expect(screen.getByRole('link', { name: testName })).toBeTruthy()
  expect(screen.getByText(card.pitch)).toBeTruthy()
})

it('keeps the size the screen gives, even in a compact grid on a computer', async () => {
  setWindow(1920, 940)
  await renderWithProviders(inCompactGrid('full'))

  expect(screen.getByRole('link', { name: testName })).toBeTruthy()
})

it('keeps the large card outside a compact grid on a computer', async () => {
  setWindow(1920, 940)
  await renderWithProviders(
    <ProjectCard {...card} tryIt={tryIt} onPress={() => {}} overlay={<Text>{CHIP}</Text>} />,
  )

  expect(screen.getByRole('link', { name: testName })).toBeTruthy()
})
