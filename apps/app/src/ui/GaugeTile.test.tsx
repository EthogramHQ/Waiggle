// Tests de la tuile de chiffre (R20, planche R20-Tri : le haut de la page de tri des Éclaireuses) :
// l'intitulé se lit comme un titre de niveau 2, la valeur et sa phrase s'écrivent, la jauge reste un
// décor caché aux lecteurs d'écran (la valeur écrite dit tout), bornée entre vide et plein.
import { screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { GaugeTile } from './GaugeTile'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Les vues cachées aux lecteurs d'écran : la jauge et son remplissage. */
const hiddenViews = () =>
  hostsOf(screen.root as unknown as Host).filter((host) => host.props['aria-hidden'] === true)

describe('GaugeTile', () => {
  it('reads its label as a level 2 heading, with its value and its detail', async () => {
    await renderWithProviders(
      <GaugeTile
        label="Le mois"
        value="Jour 12 sur 30"
        ratio={0.4}
        detail="Jusqu’au 14 déc. à minuit"
      />,
    )

    expect(screen.getByRole('header', { name: 'Le mois' })).toBeTruthy()
    expect(screen.getByText('Jour 12 sur 30')).toBeTruthy()
    expect(screen.getByText('Jusqu’au 14 déc. à minuit')).toBeTruthy()
  })

  it('hides its gauge from screen readers, and draws none without a ratio', async () => {
    const view = await renderWithProviders(<GaugeTile label="Les places" value="18 sur 30" />)
    expect(hiddenViews()).toHaveLength(0)

    await view.rerender(<GaugeTile label="Les places" value="18 sur 30" ratio={0.6} />)
    expect(hiddenViews().length).toBeGreaterThan(0)
  })

  // Une valeur fausse (plus de places prises que de places) ne déborde jamais de la tuile.
  it('keeps the gauge between empty and full', async () => {
    await renderWithProviders(<GaugeTile label="Les places" value="31 sur 30" ratio={1.4} />)

    const widths = hostsOf(screen.root as unknown as Host)
      .map((host) => StyleSheet.flatten(host.props.style as ViewStyle | undefined)?.width)
      .filter((width) => typeof width === 'string' && width.endsWith('%'))
    expect(widths).toEqual(['100%'])
  })

  it('shows its button beside the label, its action and its list', async () => {
    await renderWithProviders(
      <GaugeTile
        label="Missions de la semaine"
        trailing={<Button label="Modifier" variant="secondary" size="compact" onPress={() => {}} />}
        action={<Button label="Lancer le mois" onPress={() => {}} />}
      >
        <GaugeTile label="Dedans" value="Publie un projet avec une photo" />
      </GaugeTile>,
    )

    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lancer le mois' })).toBeTruthy()
    expect(screen.getByText('Publie un projet avec une photo')).toBeTruthy()
  })
})
