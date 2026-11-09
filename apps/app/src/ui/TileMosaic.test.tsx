// Tests de la mosaïque de tuiles (tranche R6b, scénario « La page d'un outil », planches `R6-Outil`
// et `R6-Outil-Desktop`) : les projets d'un outil en tuiles (photo, titre, auteur), du plus récent au
// plus ancien, en deux colonnes sur téléphone et quatre sur ordinateur. La relecture du plan (point
// 15) fixe deux règles :
// - la mosaïque se range **en rangées** : un lecteur d'écran et la touche Tab suivent l'ordre des
//   projets (1, 2, 3, 4…), jamais une colonne après l'autre (1, 3, 5, puis 2, 4, 6) ;
// - une tuile prend la largeur de sa colonne (`Tile.tsx` change) : plus de 150 points fixes.
//
// L'API (découpage amendé de R6b, U2) : TileMosaic({ children; columns: 2 | 4 }), avec les
// `ProjectTile` de `ui/Tile.tsx` pour enfants.
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectTile } from './Tile'
import { TileMosaic } from './TileMosaic'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Sept projets, du plus récent au plus ancien (un nombre impair : la dernière rangée est courte). */
const projects = [
  { title: 'Carnet de cafés', author: 'Sam Petit' },
  { title: 'Quel papillon ?', author: 'Hugo Lefèvre' },
  { title: 'Mon agent de recettes', author: 'Inès Garnier' },
  { title: 'Arrosage malin', author: 'Yann Le Goff' },
  { title: 'Devine la plante', author: 'Élodie Martin' },
  { title: 'Budget des vacances', author: 'Sam Petit' },
  { title: 'Lampe qui écoute', author: 'Hugo Lefèvre' },
]
const titles = projects.map((project) => project.title)

/** La mosaïque des sept projets ; `onOpen` reçoit le titre de la tuile touchée. */
function Mosaic({
  columns,
  onOpen = () => {},
}: {
  columns: 2 | 4
  onOpen?: (title: string) => void
}) {
  return (
    <TileMosaic columns={columns}>
      {projects.map((project) => (
        <ProjectTile
          key={project.title}
          title={project.title}
          author={project.author}
          onPress={() => onOpen(project.title)}
        />
      ))}
    </TileMosaic>
  )
}

/** Les noms des liens, dans l'ordre de l'arbre : celui du lecteur d'écran et de la touche Tab. */
const linkOrder = () =>
  screen.getAllByRole('link').map((link) => link.props.accessibilityLabel as string)

describe('TileMosaic', () => {
  it('lists the tile links in the order of the projects, in 2 and in 4 columns', async () => {
    const { rerender } = await renderWithProviders(<Mosaic columns={2} />)
    expect(linkOrder()).toEqual(titles)

    await rerender(<Mosaic columns={4} />)
    expect(linkOrder()).toEqual(titles)
  })

  it('opens the touched project', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(<Mosaic columns={2} onOpen={onOpen} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Arrosage malin' }))

    expect(onOpen).toHaveBeenCalledWith('Arrosage malin')
  })

  it('sizes a tile to its column, not to a fixed 150 points', async () => {
    const { rerender } = await renderWithProviders(<Mosaic columns={2} />)
    const widths = () =>
      screen
        .getAllByRole('link')
        .map((link) => (StyleSheet.flatten(link.props.style) as { width?: unknown }).width)

    expect(widths()).toHaveLength(projects.length) // témoin
    for (const width of widths()) expect(width).not.toBe(150)

    await rerender(<Mosaic columns={4} />)
    for (const width of widths()) expect(width).not.toBe(150)
  })
})
