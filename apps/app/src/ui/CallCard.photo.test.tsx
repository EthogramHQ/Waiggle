// La photo d'un appel (relecture de design R7b, B2) et son texte (relecture d'interface, A4) : la
// photo, en bande de 168 points rognée, ne montrait que 6 % d'un portrait sur ordinateur ; elle garde
// maintenant ses proportions, entière, et un appui l'ouvre en grand. Le texte d'un appel passe à la
// ligne au milieu d'une adresse collée, comme la bulle d'un retour.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CallCard } from './CallCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le vrai Text, dont on note les props reçues (préfixe `mock` : permis dans la fabrique).
const mockTextProps: Array<{ children?: unknown; breakAnywhere?: boolean }> = []
jest.mock('./Text', () => {
  const actual = jest.requireActual('./Text')
  const { createElement } = jest.requireActual('react')
  return {
    ...actual,
    Text: (props: { children?: unknown; breakAnywhere?: boolean }) => {
      mockTextProps.push(props)
      return createElement(actual.Text, props)
    },
  }
})

const URI = 'https://api.example/v1/projects/p1/testers/media/call-1'
const DESCRIPTION = 'La fusée sur son pas de tir'
const AT = '2026-11-01T09:00:00.000Z'
const CALL = 'Essayez sur https://exemple.fr/un-chemin-tres-long-sans-aucune-espace-qui-deborderait'

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const imagesOf = () =>
  hostsOf(screen.root as unknown as Host).filter(
    (node) =>
      JSON.stringify(node.props.source ?? null).includes(URI) &&
      node.props.cachePolicy !== undefined,
  )
const open = () =>
  screen.getByRole('button', { name: fr.t(($) => $.gallery.enlarge, { description: DESCRIPTION }) })

const render = (size?: { width: number; height: number }) =>
  renderWithProviders(
    <CallCard
      text={CALL}
      at={AT}
      photo={{ source: { uri: URI }, description: DESCRIPTION, ...size }}
    />,
  )

describe('CallCard photo', () => {
  it('keeps the proportions of its photo, whole, across the card at most', async () => {
    await render({ width: 390, height: 844 })

    const box = StyleSheet.flatten(open().props.style) as Record<string, unknown>
    expect(box.aspectRatio).toBeCloseTo(390 / 844)
    // Toute la largeur de la carte au plus, et jamais plus haute que 240 points.
    expect(box.width).toBe('100%')
    expect(Number(box.maxWidth)).toBeCloseTo((240 * 390) / 844)
    // Le nom de la photo reste celui de l'auteur (sa description).
    expect(screen.getByRole('image', { name: DESCRIPTION })).toBeTruthy()
  })

  it('opens its photo in full on a press, from memory only', async () => {
    await render({ width: 1600, height: 900 })

    await act(async () => {
      fireEvent.press(open())
    })

    const images = imagesOf()
    expect(images).toHaveLength(2)
    expect(images.map((image) => image.props.cachePolicy)).toEqual(['memory', 'memory'])
    expect(images[1]?.props.contentFit).toBe('contain')
  })

  it('breaks a pasted address anywhere rather than overflow', async () => {
    await render()

    // `breakAnywhere` de Text : sur le web, `overflowWrap: 'anywhere'` (le style se décide au
    // chargement du module, d'où la lecture de la prop donnée à Text plutôt que du style).
    const shown = mockTextProps.find((props) => props.children === CALL)
    expect(shown?.breakAnywhere).toBe(true)
  })
})
