// Tests du rappel du projet en tête d'une feuille (R7a) : le titre et la ligne de détail se lisent,
// la vignette est un décor caché aux lecteurs d'écran, et rien n'y est touchable.
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ProjectStrip } from './ProjectStrip'

describe('ProjectStrip', () => {
  it('reads the title of the project and its detail line', async () => {
    await render(<ProjectStrip image={null} title="Décollage !" detail="Première mise à jour" />)

    expect(screen.getByText('Décollage !')).toBeTruthy()
    expect(screen.getByText('Première mise à jour')).toBeTruthy()
  })

  it('shows a detail given as an element (a date in its sentence)', async () => {
    await render(
      <ProjectStrip
        image={null}
        title="Décollage !"
        detail={<Text>Dernière version : v1.2</Text>}
      />,
    )

    expect(screen.getByText('Dernière version : v1.2')).toBeTruthy()
  })

  it('hides the thumbnail from screen readers and offers nothing to press', async () => {
    await render(
      <ProjectStrip
        image={{ source: { uri: 'https://example.test/rocket.jpg' }, label: 'Décollage !' }}
        title="Décollage !"
      />,
    )

    // La photo n'est pas lue : son nom (le titre) ne paraît qu'une fois, dans le titre.
    expect(screen.queryAllByLabelText('Décollage !')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
