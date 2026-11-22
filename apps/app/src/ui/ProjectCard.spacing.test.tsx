// Tests de la ponctuation dans le titre et l'accroche d'une carte de projet (R18, scénario « Les
// textes des membres bien ponctués ») : ces textes sont écrits par un membre ; l'espace qu'il a
// tapée devant ? ! : ; devient insécable à l'affichage, pour que le signe ne parte jamais seul à la
// ligne. Le lien de la carte garde son nom tel qu'enregistré, et sans espace tapée rien n'est ajouté.
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut de l'arbre rendu.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectCard } from './ProjectCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)
/** L'espace insécable (U+00A0), devant : */
const NBSP = String.fromCodePoint(0x00a0)

/** Tout le texte affiché, sans rien ramener : les chaînes de l'arbre, dans l'ordre. */
type Rendered = string | { children?: Rendered[] | null } | Rendered[] | null
const rawText = (node: Rendered): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(rawText).join('')
  return (node.children ?? []).map(rawText).join('')
}
const shown = () => rawText(screen.toJSON() as Rendered)

const card = {
  author: { name: 'Nora Benali', avatar: null },
  when: 'il y a 2 jours',
  status: { label: 'En test', strong: true },
}

describe('ProjectCard, the punctuation of a member', () => {
  it('keeps the typed spaces before ? and : non-breaking in a member title and pitch', async () => {
    await renderWithProviders(
      <ProjectCard
        {...card}
        title="Ça marche ?"
        pitch="Note : chaque café goûté"
        onPress={() => {}}
      />,
    )

    // Le lien se trouve toujours par son nom (RNTL ramène l'espace insécable)…
    expect(screen.getByRole('link', { name: 'Ça marche ?' })).toBeTruthy()
    // … et le titre et l'accroche affichés gardent le signe collé à son mot.
    expect(shown()).toContain(`Ça marche${NNBSP}?`)
    expect(shown()).toContain(`Note${NBSP}: chaque café goûté`)
    expect(shown()).not.toContain('Ça marche ?')
  })

  it('adds nothing to a title typed without a space (control)', async () => {
    await renderWithProviders(<ProjectCard {...card} title="Ça marche?" onPress={() => {}} />)

    expect(shown()).toContain('Ça marche?')
  })
})
