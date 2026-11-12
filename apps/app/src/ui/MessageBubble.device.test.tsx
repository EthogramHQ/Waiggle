// L'icône de l'appareil d'un retour (R7b, planche R7b-Fil : « Téléphone » avec son téléphone,
// « Ordinateur » avec son écran). `device` n'est qu'un libellé traduit : la sorte d'appareil
// (`deviceKind`, prop facultative ajoutée à l'API fixée) choisit l'icône ; sans elle, le libellé
// s'écrit seul, plutôt qu'avec une icône qui pourrait mentir.
import type { FeedbackDevice } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { iconPaths } from './icons.generated'
import { MessageBubble } from './MessageBubble'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Les tracés dessinés dans l'arbre (les `d` des icônes). */
const drawnPaths = () =>
  hostsOf(screen.root as unknown as Host)
    .map((node) => node.props.d)
    .filter((d): d is string => typeof d === 'string')

const bubble = (deviceKind?: FeedbackDevice) => (
  <MessageBubble
    from="tester"
    kind="feedback"
    mine={false}
    name="Inès Morel"
    text="Le niveau 3 rame un peu."
    at="2026-11-01T10:00:00.000Z"
    device="Ordinateur"
    {...(deviceKind ? { deviceKind } : null)}
  />
)

describe('MessageBubble device icon', () => {
  it.each([
    ['computer', 'desktop'],
    ['phone', 'device-mobile'],
  ] as const)('draws the icon of a %s next to its label', async (kind, icon) => {
    await renderWithProviders(bubble(kind))

    expect(screen.getByText('Ordinateur')).toBeTruthy()
    expect(drawnPaths()).toEqual(expect.arrayContaining([...iconPaths[icon]]))
  })

  it('writes the label alone when the kind of device is not given', async () => {
    await renderWithProviders(bubble())

    expect(screen.getByText('Ordinateur')).toBeTruthy() // témoin
    // Les tracés lus comme de simples textes (le module les type un par un).
    const devices: readonly string[] = [...iconPaths.desktop, ...iconPaths['device-mobile']]
    expect(drawnPaths().filter((d) => devices.includes(d))).toEqual([])
  })
})
