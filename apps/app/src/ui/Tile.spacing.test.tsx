// Tests de la ponctuation dans le titre d'une tuile de projet (R18, scénario « Les textes des membres
// bien ponctués ») : le titre est écrit par un membre ; l'espace qu'il a tapée devant ? ! : ;
// devient insécable à l'affichage, pour que le signe ne parte jamais seul à la ligne. Le lien garde
// son nom lu, et sans espace tapée rien n'est ajouté.
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut de l'arbre rendu.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectTile } from './Tile'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)

/** Tout le texte affiché, sans rien ramener : les chaînes de l'arbre, dans l'ordre. */
type Rendered = string | { children?: Rendered[] | null } | Rendered[] | null
const rawText = (node: Rendered): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(rawText).join('')
  return (node.children ?? []).map(rawText).join('')
}
const shown = () => rawText(screen.toJSON() as Rendered)

describe('ProjectTile, the punctuation of a member', () => {
  it('keeps the typed space before ? non-breaking in a member title', async () => {
    await renderWithProviders(
      <ProjectTile title="Ça marche ?" author="Sam Petit" onPress={() => {}} />,
    )

    // Le lien se trouve toujours par son nom (RNTL ramène l'espace insécable)…
    expect(screen.getByRole('link', { name: 'Ça marche ?' })).toBeTruthy()
    // … et le titre affiché garde le point d'interrogation collé à son mot.
    expect(shown()).toContain(`Ça marche${NNBSP}?`)
    expect(shown()).not.toContain('Ça marche ?')
  })

  it('adds nothing to a title typed without a space (control)', async () => {
    await renderWithProviders(
      <ProjectTile title="Ça marche?" author="Sam Petit" onPress={() => {}} />,
    )

    expect(shown()).toContain('Ça marche?')
  })
})
