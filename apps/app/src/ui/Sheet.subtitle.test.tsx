// La phrase sous le titre d'une feuille qui porte son action, sur téléphone (relecture du 10/11,
// après R7a) : « Nouveau projet » avait perdu son introduction quand la tête à action (R6a) avait
// remplacé la tête ordinaire. Mise dans la tête fixe, elle grandissait avec le texte agrandi et
// prenait 103 % d'une fenêtre de 320 × 568 à 200 % : elle ouvre donc le contenu qui défile.
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const SUBTITLE = 'Dis-nous en deux mots ce que tu as fabriqué.'

type Host = { type: unknown; parent: Host | null; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur : c'est l'ordre de lecture. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le rang d'un élément dans l'ordre de lecture. */
const rank = (element: unknown): number =>
  hostsOf(screen.root as unknown as Host).indexOf(element as Host)

/** Vrai si l'élément est dans une zone qui défile (la `ScrollView`, rendue en `RCTScrollView`). */
const inScrollArea = (element: unknown): boolean => {
  for (let node = (element as Host).parent; node; node = node.parent) {
    if (node.type === 'RCTScrollView') return true
  }
  return false
}

const open = (cancelLabel?: string) =>
  renderWithProviders(
    <Sheet
      open
      title="Nouveau projet"
      subtitle={SUBTITLE}
      onClose={jest.fn()}
      {...(cancelLabel ? { cancelLabel } : null)}
      action={{ label: 'Publier', onPress: () => {} }}
    >
      <Text>Le titre de ton projet</Text>
    </Sheet>,
  )

describe('the phone head of a sheet with an action', () => {
  it('reads the subtitle after the title and the action, before the content', async () => {
    await open('Annuler')

    const title = screen.getByRole('header', { name: 'Nouveau projet' })
    const action = screen.getByRole('button', { name: 'Publier' })
    const subtitle = screen.getByText(SUBTITLE)
    const content = screen.getByText('Le titre de ton projet')
    expect(rank(title)).toBeLessThan(rank(action))
    expect(rank(action)).toBeLessThan(rank(subtitle))
    expect(rank(subtitle)).toBeLessThan(rank(content))
  })

  it('puts the subtitle in the scrolling area, not in the fixed head', async () => {
    await open('Annuler')

    expect(inScrollArea(screen.getByText(SUBTITLE))).toBe(true)
    // Témoin : le titre, lui, reste dans la tête fixe, hors de la zone qui défile.
    expect(inScrollArea(screen.getByRole('header', { name: 'Nouveau projet' }))).toBe(false)
  })

  it('centres it with « Annuler », like the title', async () => {
    await open('Annuler')

    expect(StyleSheet.flatten(screen.getByText(SUBTITLE).props.style).textAlign).toBe('center')
  })

  it('aligns it to the left without « Annuler », like the title', async () => {
    await open()

    expect(StyleSheet.flatten(screen.getByText(SUBTITLE).props.style).textAlign).toBe('left')
  })

  it('shows nothing when there is no subtitle (témoin)', async () => {
    await renderWithProviders(
      <Sheet
        open
        title="Nouveau projet"
        onClose={jest.fn()}
        cancelLabel="Annuler"
        action={{ label: 'Publier', onPress: () => {} }}
      >
        <Text>Le titre de ton projet</Text>
      </Sheet>,
    )

    expect(screen.queryByText(SUBTITLE)).toBeNull()
    expect(screen.getByText('Le titre de ton projet')).toBeTruthy()
  })
})

// Relecture du 10/11 (S1) : la boîte de dialogue est nommée par son titre ; elle est aussi décrite
// par la phrase, pour qu'un lecteur d'écran la lise à l'ouverture et non seulement en parcourant.
describe('the description of the dialog on the web', () => {
  type Props = Record<string, unknown>
  // Un faux document : chaque propriété lue existe (les feuilles du web y posent des styles).
  const fakeDocument = (): object => {
    const node = (): object =>
      new Proxy({ style: { setProperty: jest.fn(), removeProperty: jest.fn() } } as Props, {
        get(target, key) {
          if (key === 'then') return undefined
          if (!(key in target)) {
            target[key as string] =
              key === 'documentElement' || key === 'body' || key === 'head'
                ? node()
                : jest.fn(() => undefined)
          }
          return target[key as string]
        },
      })
    return node()
  }
  const layerProps = (): Props => {
    const found = hostsOf(screen.root as unknown as Host).find(
      (node) => typeof (node as unknown as { props: Props }).props.onRequestClose === 'function',
    )
    if (!found) throw new Error('no Modal layer')
    return (found as unknown as { props: Props }).props
  }
  const withWeb = async (run: () => Promise<void>) => {
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument(),
      configurable: true,
    })
    try {
      await run()
    } finally {
      jest.restoreAllMocks()
      Reflect.deleteProperty(globalThis, 'document')
    }
  }

  it('is described by the subtitle of a sheet with an action', async () => {
    await withWeb(async () => {
      await open('Annuler')

      const subtitle = screen.getByText(SUBTITLE)
      expect(layerProps()['aria-describedby']).toBe(subtitle.props.nativeID)
      expect(subtitle.props.nativeID).toBeTruthy()
    })
  })

  it('is described by the subtitle of a sheet without an action', async () => {
    await withWeb(async () => {
      await renderWithProviders(
        <Sheet open title="Partager" subtitle={SUBTITLE} onClose={jest.fn()}>
          <Text>Le lien</Text>
        </Sheet>,
      )

      const subtitle = screen.getByText(SUBTITLE)
      expect(layerProps()['aria-describedby']).toBe(subtitle.props.nativeID)
      expect(subtitle.props.nativeID).toBeTruthy()
    })
  })

  it('has no description without a subtitle (témoin)', async () => {
    await withWeb(async () => {
      await renderWithProviders(
        <Sheet open title="Partager" onClose={jest.fn()}>
          <Text>Le lien</Text>
        </Sheet>,
      )

      expect(screen.getByText('Le lien')).toBeTruthy()
      expect(layerProps()['aria-labelledby']).toBeTruthy()
      expect(layerProps()['aria-describedby']).toBeUndefined()
    })
  })
})
