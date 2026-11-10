// Tests de l'étiquette d'un outil (refonte, tranche R3, « Outils populaires » et « Tous les
// outils ») : avec un nombre, elle l'affiche et son nom lu devient « Claude, 41 projets »
// (`tools.withCount` et le pluriel `tools.projects`) ; le nombre affiché reste hors du nom lu
// (relecture de l'interface, « À noter »). Sans nombre, rien ne change : le libellé seul.
// Puis (R6a) l'étiquette à icône : la catégorie d'un projet, sur sa carte (« Sciences et espace »).
// Puis (R6b) l'étiquette d'un « Autre », en texte simple, sans lien.
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { iconPaths } from './icons.generated'
import { Tag } from './Tag'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le nom lu d'un outil avec son nombre, tel que les traductions le composent. */
const spoken = (label: string, count: number) =>
  fr.t(($) => $.tools.withCount, {
    label,
    projects: fr.t(($) => $.tools.projects, { count }),
  })

describe('Tag with a count', () => {
  it('composes the spoken name from the translations (witness)', () => {
    // R6b (choix 1 du plan) : « projets », plus « projets publics ».
    expect(spoken('Claude', 41)).toBe('Claude, 41 projets')
    expect(spoken('Claude', 1)).toBe('Claude, 1 projet')
  })

  it('shows the number and reads « Claude, 41 projets » as a link', async () => {
    await renderWithProviders(<Tag label="Claude" count={41} onPress={() => {}} />)

    expect(screen.getByText('41')).toBeTruthy()
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByRole('link', { name: spoken('Claude', 41) })).toBeTruthy()
  })

  it('uses the singular for one project', async () => {
    await renderWithProviders(<Tag label="Python" count={1} onPress={() => {}} />)

    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByRole('link', { name: spoken('Python', 1) })).toBeTruthy()
  })

  it('reads the count too when it is a plain pill, without a link', async () => {
    await renderWithProviders(<Tag label="Claude" count={41} />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('41')).toBeTruthy()
    expect(screen.getByLabelText(spoken('Claude', 41))).toBeTruthy()
  })

  it('says the count in English too', async () => {
    await renderWithProviders(<Tag label="Claude" count={41} onPress={() => {}} />, 'en')

    const en = screen.getByRole('link')
    const name = (en.props as Record<string, unknown>).accessibilityLabel
    expect(name).toContain('Claude')
    expect(name).toContain('41')
    // Un vrai pluriel anglais, pas le français : le nom lu change de langue avec l'appli.
    expect(name).not.toContain('projets')
  })
})

describe('Tag without a count', () => {
  it('is a link named by its label alone', async () => {
    await renderWithProviders(<Tag label="Claude" onPress={() => {}} />)

    expect(screen.getByRole('link', { name: 'Claude' })).toBeTruthy()
    // Aucun nombre, aucune mention de projets.
    expect(screen.queryByText(/projet/)).toBeNull()
  })

  it('stays a plain pill with its label when it cannot be touched', async () => {
    await renderWithProviders(<Tag label="Claude" />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Claude')).toBeTruthy()
  })
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/**
 * Ce qui est dessiné, dans l'ordre : le nom d'une icône reconnue à son tracé (`iconPaths`, le dessin
 * de chaque icône), le texte sinon. On ne lit aucun style.
 */
const drawnOrder = (node: Host | string): string[] => {
  if (typeof node === 'string') return [node]
  const d = node.props.d
  if (typeof d === 'string') {
    const icon = Object.entries(iconPaths).find(([, paths]) => paths[0] === d)?.[0]
    return icon ? [`icône ${icon}`] : []
  }
  return node.children.flatMap(drawnOrder)
}

// R6a (scénario « La catégorie sur les cartes et la page » ; relecture du plan ui-B5) : la catégorie
// principale d'un projet, en étiquette de verre, « avec son icône ». L'icône est décorative : le nom
// lu reste le libellé (`Icon` est déjà cachée aux lecteurs d'écran).
describe('Tag with an icon (R6a)', () => {
  const science = fr.t(($) => $.project.category.science)

  it('draws the icon before the label, the spoken name unchanged', async () => {
    await renderWithProviders(<Tag label={science} icon="planet" onPress={() => {}} />)

    const link = screen.getByRole('link', { name: science })
    expect(drawnOrder(link as unknown as Host)).toEqual(['icône planet', science])
  })

  it('draws it on a plain glass pill too, the label still shown', async () => {
    await renderWithProviders(<Tag label={science} icon="planet" onGlass />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(science)).toBeTruthy()
    expect(drawnOrder(screen.root as unknown as Host)).toEqual(['icône planet', science])
  })

  it('draws no icon without one (witness)', async () => {
    await renderWithProviders(<Tag label={science} onPress={() => {}} />)

    const link = screen.getByRole('link', { name: science })
    expect(drawnOrder(link as unknown as Host)).toEqual([science])
  })
})

// Correction C2 de R6a (relecture de design, C3) : Miel réserve la police à chasse fixe aux outils,
// versions et prompts ; la catégorie d'un projet s'écrit en police de texte (planches R6-Danse et
// R6-Publier-Desktop). Le test lit la règle (« pas la chasse fixe »), pas le nom d'une police.
describe('Tag of a category (R6a, C2)', () => {
  const science = fr.t(($) => $.project.category.science)
  const familyOf = (text: string) =>
    String(StyleSheet.flatten(screen.getByText(text).props.style).fontFamily)

  it('writes a tool in the fixed-width font (witness)', async () => {
    await renderWithProviders(<Tag label="Claude" onPress={() => {}} />)

    expect(familyOf('Claude')).toMatch(/mono/i)
  })

  it('writes a category in the text font, its spoken name unchanged', async () => {
    await renderWithProviders(<Tag label={science} icon="planet" kind="category" onGlass />)

    expect(familyOf(science)).not.toMatch(/mono/i)
  })

  it('keeps the text font for a category that is a link', async () => {
    await renderWithProviders(
      <Tag label={science} icon="planet" kind="category" onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: science })).toBeTruthy()
    expect(familyOf(science)).not.toMatch(/mono/i)
  })
})

// R6b (scénario « Où les outils s'affichent » ; relecture du plan, point 15) : un outil du catalogue
// est une étiquette qui mène à sa page ; un « Autre » (`inCatalogue={false}`) est écrit en texte
// simple, sans lien, tant qu'il n'est pas entré au catalogue, et un lecteur d'écran lit « Teachable
// Machine, autre outil, pas encore dans le catalogue » (`tool.otherSpoken`), sur un élément qui a un
// rôle (pas un simple texte perdu dans la rangée).
describe('Tag of an other tool (R6b)', () => {
  const SPOKEN = fr.t(($) => $.tool.otherSpoken, { name: 'Teachable Machine' })

  it('composes the spoken name from the translations (witness)', () => {
    expect(SPOKEN).toBe('Teachable Machine, autre outil, pas encore dans le catalogue')
  })

  it('reads an other tool by its full name with a role, and is not a link', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Tag label="Teachable Machine" inCatalogue={false} onPress={onPress} />,
    )

    expect(screen.queryByRole('link')).toBeNull()
    const pill = screen.getByLabelText(SPOKEN)
    const role = pill.props.accessibilityRole ?? pill.props.role
    expect(typeof role).toBe('string')
    expect(role).not.toBe('link')
    expect(role).not.toBe('button')
    // Le nom tel qu'il a été tapé reste écrit.
    expect(screen.getByText('Teachable Machine')).toBeTruthy()
    // Rien ne mène à une page qui n'existe pas.
    await fireEvent.press(pill)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('reads an other tool by its full name without onPress too', async () => {
    await renderWithProviders(<Tag label="Teachable Machine" inCatalogue={false} />)

    expect(screen.getByLabelText(SPOKEN)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('stays a link named by its label for a catalogue tool (witness)', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Tag label="Claude" inCatalogue onPress={onPress} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Claude' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
