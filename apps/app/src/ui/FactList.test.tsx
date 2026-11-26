// Tests de la liste de renseignements (R20, « Joint au retour » d'un retour d'Éclaireuse) : une
// liste nommée par son titre, une ligne lue « Écran : /projects/42 », jamais un lien (relecture de
// sécurité du plan R20, A3), et sa phrase quand rien n'est joint.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { FactList } from './FactList'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const facts = [
  { label: 'Écran', value: '/projects/42', mono: true },
  { label: 'Appareil', value: 'Téléphone' },
  { label: 'Langue', value: 'Français' },
]

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/**
 * Les noms lus des vues de ce rôle. RNTL ne sait pas chercher « list » et « listitem » par rôle
 * (rôles du web, que React Native ne connaît pas) : on lit la propriété `role` de chaque vue.
 */
const namesOf = (role: 'list' | 'listitem') =>
  hostsOf(screen.root as unknown as Host)
    .filter((host) => host.props.role === role)
    .map((host) => host.props.accessibilityLabel)

describe('FactList', () => {
  it('is a list named by its title, one item per fact, read « label : value »', async () => {
    await renderWithProviders(<FactList title="Joint au retour" facts={facts} />)

    expect(namesOf('list')).toEqual(['Joint au retour'])
    expect(namesOf('listitem')).toEqual([
      'Écran : /projects/42',
      'Appareil : Téléphone',
      'Langue : Français',
    ])
    expect(screen.getByText('Joint au retour')).toBeTruthy()
  })

  // Une adresse jointe vient d'un membre : elle s'écrit, elle ne mène nulle part.
  it('writes an address as text, never as a link', async () => {
    await renderWithProviders(<FactList title="Joint au retour" facts={facts} />)

    expect(screen.getByText('/projects/42')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('says its empty sentence when nothing is attached, without an empty list', async () => {
    await renderWithProviders(
      <FactList title="Joint au retour" facts={[]} empty="Rien n’est joint." />,
    )

    expect(screen.getByText('Rien n’est joint.')).toBeTruthy()
    expect(namesOf('list')).toEqual([])
  })
})
