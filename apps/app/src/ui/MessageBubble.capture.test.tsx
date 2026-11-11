// La capture d'un retour dans sa bulle (relecture de design R7b, B1) : une capture de téléphone,
// plus haute que large, se voyait à 32 % dans une vignette rognée, et rien ne l'ouvrait. Elle garde
// maintenant ses proportions, entière, et un appui l'ouvre en grand, toujours sans cache disque.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MessageBubble } from './MessageBubble'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const URI = 'https://api.example/v1/projects/p1/testers/media/m1'
const NAME = 'Capture d’écran jointe au retour d’Inès Morel'
const AT = '2026-11-01T09:00:00.000Z'

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Les images dessinées de cette adresse (la vignette, et celle de la visionneuse ouverte). */
const imagesOf = () =>
  hostsOf(screen.root as unknown as Host).filter(
    (node) =>
      JSON.stringify(node.props.source ?? null).includes(URI) &&
      node.props.cachePolicy !== undefined,
  )

const open = () =>
  screen.getByRole('button', { name: fr.t(($) => $.gallery.enlarge, { description: NAME }) })
const boxOf = () => StyleSheet.flatten(open().props.style) as Record<string, unknown>

const render = (size?: { width: number; height: number }) =>
  renderWithProviders(
    <MessageBubble
      from="tester"
      kind="feedback"
      mine={false}
      name="Inès Morel"
      text="Le score repart à zéro."
      at={AT}
      capture={{ source: { uri: URI }, description: NAME, ...size }}
    />,
  )

describe('MessageBubble capture', () => {
  it('keeps the proportions of a portrait phone capture, whole, never cropped', async () => {
    await render({ width: 390, height: 844 })

    // Le cadre a les proportions de l'image : rien n'est rogné, quelle que soit la façon de remplir.
    expect(boxOf().aspectRatio).toBeCloseTo(390 / 844)
    // Assez haute pour se lire dans la bulle, sans manger l'écran : 240 points au plus.
    expect(Number(boxOf().width)).toBeCloseTo((240 * 390) / 844)
    for (const image of imagesOf()) expect(image.props.contentFit).not.toBe('cover')
  })

  it('takes the proportions of the loaded image when the screen does not give them', async () => {
    await render()
    const [image] = imagesOf()
    expect(image).toBeTruthy()

    await act(async () => {
      // L'évènement natif d'expo-image : les dimensions de l'image chargée.
      fireEvent(image as never, 'load', { nativeEvent: { source: { width: 390, height: 844 } } })
    })

    expect(boxOf().aspectRatio).toBeCloseTo(390 / 844)
  })

  it('opens the capture in full on a press, from memory only, and closes it', async () => {
    await render({ width: 390, height: 844 })
    // Témoin : fermée, une seule image (la vignette).
    expect(imagesOf()).toHaveLength(1)

    await act(async () => {
      fireEvent.press(open())
    })

    // La visionneuse : l'image entière (contain), en mémoire seulement, et « Fermer ».
    const images = imagesOf()
    expect(images).toHaveLength(2)
    expect(images.map((image) => image.props.cachePolicy)).toEqual(['memory', 'memory'])
    expect(images[1]?.props.contentFit).toBe('contain')
    // « Fermer » ignore les tapes des 600 premières ms (la seconde tape d'une double tape).
    await passTapGuard()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))
    })
    expect(imagesOf()).toHaveLength(1)
  })
})
