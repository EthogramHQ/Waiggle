// La phrase sous le titre d'une feuille qui porte son action, sur téléphone (décision du 10/11,
// après R7a) : « Nouveau projet » avait perdu son introduction quand la tête à action (R6a) avait
// remplacé la tête ordinaire, la seule qui montrait `subtitle`.
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Sheet } from './Sheet'
import { SheetHeader } from './SheetHeader'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const SUBTITLE = 'Dis-nous en deux mots ce que tu as fabriqué.'

type Host = { children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur : c'est l'ordre de lecture. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le rang d'un élément dans l'ordre de lecture. */
const rank = (element: unknown): number =>
  hostsOf(screen.root as unknown as Host).indexOf(element as Host)

describe('the phone head of a sheet with an action', () => {
  it('shows the subtitle after the title, before the content', async () => {
    await renderWithProviders(
      <Sheet
        open
        title="Nouveau projet"
        subtitle={SUBTITLE}
        onClose={jest.fn()}
        cancelLabel="Annuler"
        action={{ label: 'Publier', onPress: () => {} }}
      >
        <Text>Le titre de ton projet</Text>
      </Sheet>,
    )

    const title = screen.getByRole('header', { name: 'Nouveau projet' })
    const subtitle = screen.getByText(SUBTITLE)
    const content = screen.getByText('Le titre de ton projet')
    expect(rank(title)).toBeLessThan(rank(subtitle))
    expect(rank(subtitle)).toBeLessThan(rank(content))
  })

  it('shows it without « Annuler » too, aligned to the left like the title', async () => {
    await renderWithProviders(
      <SheetHeader
        title="Catégorie et outils"
        subtitle={SUBTITLE}
        action={{ label: 'OK', onPress: () => {} }}
      />,
    )

    const line = screen.getByText(SUBTITLE)
    expect(StyleSheet.flatten(line.props.style).textAlign).toBe('left')
  })

  it('centres it with « Annuler », like the title', async () => {
    await renderWithProviders(
      <SheetHeader
        title="Nouveau projet"
        subtitle={SUBTITLE}
        cancel={{ label: 'Annuler', onPress: () => {} }}
        action={{ label: 'Publier', onPress: () => {} }}
      />,
    )

    expect(StyleSheet.flatten(screen.getByText(SUBTITLE).props.style).textAlign).toBe('center')
  })

  it('shows nothing when there is no subtitle (témoin)', async () => {
    await renderWithProviders(
      <SheetHeader
        title="Nouveau projet"
        cancel={{ label: 'Annuler', onPress: () => {} }}
        action={{ label: 'Publier', onPress: () => {} }}
      />,
    )

    expect(screen.queryByText(SUBTITLE)).toBeNull()
  })
})
