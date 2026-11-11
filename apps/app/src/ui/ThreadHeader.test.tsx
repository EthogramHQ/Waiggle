// Tests de l'en-tête d'un fil de retours (R7b, planche validée 10, relecture du plan ui-B1 et B10) :
// en haut du fil privé entre un testeur et l'auteur, la photo de l'autre personne, son nom en titre,
// le projet, et sur ordinateur « Dans les testeurs depuis le 2 nov. ». Le nom est un titre de niveau
// 2 : c'est là que le focus arrive quand on ouvre un fil à côté de la liste (ui-B1), d'où `headingRef`.
//
// L'API (plan R7b, « API fixée à l'assemblage ») :
// `ThreadHeader({ name: string; avatar: ImageSource | null; project: string;
//   since?: string | null; headingRef?: Ref<View> })`, `since` déjà formaté par l'écran.
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, type View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import type { ImageSource } from './image'
import { ThreadHeader } from './ThreadHeader'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const AVATAR_URI = 'https://media.example/avatars/ines.webp'
const avatar: ImageSource = { uri: AVATAR_URI }
const name = 'Inès Morel'
const project = 'Décollage !'
const since = fr.t(($) => $.project.testers.list.sinceLong, { date: '2 nov.' })

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (en profondeur). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)
/** La place d'un élément dans l'ordre de lecture. */
const place = (node: unknown) => all().indexOf(node as Host)

/** Un élément de l'arbre affiche-t-il l'image de cette adresse ? */
const drawsUri = (uri: string) =>
  all().some((node) => JSON.stringify(node.props.source ?? null).includes(uri))

describe('ThreadHeader', () => {
  it('shows the name as a level-2 heading, then the project and the date', async () => {
    await renderWithProviders(
      <ThreadHeader name={name} avatar={avatar} project={project} since={since} />,
    )

    expect(since).toMatch(/^Dans les testeurs depuis le 2\snov\.$/)
    const heading = screen.getByRole('header', { name })
    expect(screen.getByText(project)).toBeTruthy()
    expect(screen.getByText(since)).toBeTruthy()
    expect(drawsUri(AVATAR_URI)).toBe(true)
    // Le nom d'abord : c'est lui que le lecteur d'écran lit en arrivant.
    expect(place(heading)).toBeLessThan(place(screen.getByText(project)))
    expect(place(heading)).toBeLessThan(place(screen.getByText(since)))
  })

  it('is a level-2 heading on the web', async () => {
    // Le niveau (`aria-level`) n'existe que sur le web, où il donne une vraie balise <h2>.
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<ThreadHeader name={name} avatar={null} project={project} />)

      expect(screen.getByRole('header', { name }).props['aria-level']).toBe(2)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it.each([
    ['missing', undefined],
    ['null', null],
  ] as const)('shows no date when since is %s', async (_case, value) => {
    await renderWithProviders(
      <ThreadHeader name={name} avatar={avatar} project={project} since={value} />,
    )

    expect(screen.getByRole('header', { name })).toBeTruthy() // témoin
    expect(screen.getByText(project)).toBeTruthy()
    expect(screen.queryByText(/depuis le/)).toBeNull()
  })

  it('gives its heading to headingRef, for the screen to move the focus onto it', async () => {
    const headingRef = createRef<View>()
    await renderWithProviders(
      <ThreadHeader name={name} avatar={null} project={project} headingRef={headingRef} />,
    )

    expect(headingRef.current).not.toBeNull()
    // La `ref` tient le titre lui-même, pas la rangée qui l'entoure : le focus s'y pose sur le nom.
    const props = (headingRef.current as unknown as Host).props
    expect(props.role ?? props.accessibilityRole).toBe('header')
    expect(screen.getByRole('header', { name })).toBeTruthy()
  })

  it('keeps one heading only: the photo does not repeat the name as a second title', async () => {
    await renderWithProviders(<ThreadHeader name={name} avatar={null} project={project} />)

    expect(screen.getAllByRole('header')).toHaveLength(1)
  })
})
