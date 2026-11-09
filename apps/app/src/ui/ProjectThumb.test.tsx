// Tests de la vignette d'un projet (tranche R6a, scénario « Supprimer », planche `R6-Supprimer` ;
// relecture du plan ui-B5) : en tête de la fenêtre « Supprimer « Le ciel de ce soir » ? », la
// vignette du projet avec un badge de corbeille (`Dialog.illustration`).
//
// La vignette est un décor : le titre de la fenêtre nomme déjà le projet, et son message dit ce qui
// disparaît. Elle est donc cachée aux lecteurs d'écran (ni la photo ni la corbeille ne sont lues),
// et rien n'y est touchable. Sans photo, la vignette garde sa place et son badge.
//
// L'API (découpage amendé de R6a, U7) : ProjectThumb({ image: CoverImage | null; badge: 'trash' }).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { iconPaths } from './icons.generated'
import type { CoverImage } from './ProjectCover'
import { ProjectThumb } from './ProjectThumb'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const PHOTO_URI = 'https://media.example/visuals/ciel-1.webp'
const photo: CoverImage = { source: { uri: PHOTO_URI }, label: 'Photo 1 sur 3' }

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

/** Un élément de l'arbre affiche-t-il l'image de cette adresse ? */
const drawsUri = (uri: string) =>
  all().some((node) => JSON.stringify(node.props.source ?? null).includes(uri))

/** La corbeille est-elle dessinée ? On la reconnaît à son tracé (`iconPaths`), sans lire de style. */
const drawsTrash = () => all().some((node) => node.props.d === iconPaths.trash[0])

describe('ProjectThumb', () => {
  it('draws the photo of the project with a trash badge', async () => {
    await renderWithProviders(<ProjectThumb image={photo} badge="trash" />)

    expect(drawsUri(PHOTO_URI)).toBe(true)
    expect(drawsTrash()).toBe(true)
  })

  it('keeps its badge without a photo', async () => {
    await renderWithProviders(<ProjectThumb image={null} badge="trash" />)

    expect(drawsUri(PHOTO_URI)).toBe(false)
    expect(drawsTrash()).toBe(true)
  })

  it('is a decoration: nothing in it is read or touched', async () => {
    await renderWithProviders(<ProjectThumb image={photo} badge="trash" />)

    expect(drawsUri(PHOTO_URI)).toBe(true) // témoin : la photo est là
    // Ni le nom de la photo, ni une image nommée, ni un bouton.
    expect(screen.queryByLabelText(photo.label)).toBeNull()
    expect(screen.queryAllByRole('image')).toHaveLength(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
