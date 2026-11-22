// Tests de la ponctuation dans une mise à jour de projet (R18, scénario « Les textes des membres bien
// ponctués ») : le titre de la mise à jour est écrit par un membre ; l'espace qu'il a tapée devant
// ? ! : ; devient insécable à l'affichage. Le titre se trouve toujours par son rôle et son nom, et
// le texte enregistré (celui que le bouton « Supprimer » nomme) ne change pas.
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut de l'arbre rendu.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { rocketUpdate } from '../testing/updates'
import type { ImageSource } from './image'
import { UpdateEntry } from './UpdateEntry'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)

/** Les photos de l'API, servies telles quelles. */
const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)

/** Tout le texte affiché, sans rien ramener : les chaînes de l'arbre, dans l'ordre. */
type Rendered = string | { children?: Rendered[] | null } | Rendered[] | null
const rawText = (node: Rendered): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(rawText).join('')
  return (node.children ?? []).map(rawText).join('')
}
const shown = () => rawText(screen.toJSON() as Rendered)

/** Les titres de la page (rôle `header` sur téléphone ; `heading` est son nom sur le web). */
const headings = () => [...screen.queryAllByRole('header'), ...screen.queryAllByRole('heading')]

describe('UpdateEntry, the punctuation of a member', () => {
  it('keeps the typed space before ? non-breaking in a member title', async () => {
    await renderWithProviders(
      <UpdateEntry update={{ ...rocketUpdate, title: 'Ça décolle ?' }} toSource={toSource} />,
    )

    // Le titre est là, trouvé par son rôle…
    const titles = headings().filter((node) => rawText(node as unknown as Rendered).length > 0)
    expect(titles.map((node) => rawText(node as unknown as Rendered))).toContain(
      `Ça décolle${NNBSP}?`,
    )
    // … et l'espace ordinaire tapée n'est plus affichée devant le point d'interrogation.
    expect(shown()).not.toContain('Ça décolle ?')
  })

  it('adds nothing to a title typed without a space (control)', async () => {
    await renderWithProviders(
      <UpdateEntry update={{ ...rocketUpdate, title: 'Ça décolle?' }} toSource={toSource} />,
    )

    expect(shown()).toContain('Ça décolle?')
  })
})
