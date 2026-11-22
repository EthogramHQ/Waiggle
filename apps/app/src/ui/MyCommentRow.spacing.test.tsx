// Test de la ponctuation dans « Mes commentaires » (R18, scénario « Les textes des membres bien
// ponctués ») : le commentaire est écrit par un membre ; l'espace qu'il a tapée devant ? ! : ;
// devient insécable à l'affichage. Le nom lu du bouton « Supprimer » ne change pas.
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut de l'arbre rendu.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { MyCommentRow } from './MyCommentRow'

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

describe('MyCommentRow, the punctuation of a member', () => {
  it('keeps the typed space before ? non-breaking in a member comment', async () => {
    await renderWithProviders(
      <MyCommentRow
        goneLabel="Projet qui n’est plus visible"
        date="2026-11-14T18:00:00.000Z"
        projectTitle="Carnet de cafés"
        body="Ça marche vraiment ?"
        deleteText="Supprimer"
        deleteLabel="Supprimer le commentaire : Ça marche vraiment ?"
        onDelete={() => {}}
      />,
    )

    expect(shown()).toContain(`Ça marche vraiment${NNBSP}?`)
    expect(shown()).not.toContain('Ça marche vraiment ?')
    // Le nom lu du bouton garde le texte tel qu'enregistré.
    expect(
      screen.getByRole('button', { name: 'Supprimer le commentaire : Ça marche vraiment ?' }),
    ).toBeTruthy()
  })
})
