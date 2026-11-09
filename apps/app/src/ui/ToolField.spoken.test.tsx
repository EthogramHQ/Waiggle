// Le nom lu d'une suggestion du champ des outils, avec les vrais textes de l'appli (`useToolLabels`,
// relecture ui-C3 de R6b). La ligne affiche « Claude », puis « Assistant IA · 41 projets » ; le nom
// lu doit dire la même chose, famille comprise, et « Aucun projet pour l’instant » à zéro, pas
// « Claude, 0 projet » (un nombre qui contredisait le texte vu : WCAG 2.5.3, le nom contient le
// libellé visible).
import { PROJECT_TOOLS_MAX } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { useToolLabels } from '../tools/labels'
import { ToolField, type ToolSuggestion } from './ToolField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.project.form.tools)

/** Le champ, avec les textes de la feuille d'un projet public. */
function Field({ suggestions }: { suggestions: ToolSuggestion[] }) {
  const labels = useToolLabels('public')
  const [values, setValues] = useState<string[]>([])
  return (
    <ToolField
      label={LABEL}
      values={values}
      onChange={setValues}
      suggestions={suggestions}
      onQuery={() => {}}
      limit={PROJECT_TOOLS_MAX}
      labels={labels}
      known={false}
      catalogueReady
      isOther={() => false}
    />
  )
}

describe('ToolField, the spoken name of a suggestion', () => {
  it('reads the family and the number shown under the name', async () => {
    await renderWithProviders(
      <Field suggestions={[{ name: 'Claude', uses: 41, family: 'assistant' }]} />,
    )
    await fireEvent.changeText(screen.getByRole('combobox', { name: LABEL }), 'cl')

    expect(screen.getByRole('option', { name: 'Claude, Assistant IA · 41 projets' })).toBeTruthy()
  })

  it('reads « Aucun projet pour l’instant » rather than « 0 projet »', async () => {
    await renderWithProviders(
      <Field
        suggestions={[
          { name: 'Claude', uses: 0, family: 'assistant' },
          { name: 'Lobe', uses: 0, family: null },
        ]}
      />,
    )
    await fireEvent.changeText(screen.getByRole('combobox', { name: LABEL }), 'l')

    const none = fr.t(($) => $.tools.noProjects)
    expect(screen.getByRole('option', { name: `Claude, Assistant IA · ${none}` })).toBeTruthy()
    // Sans famille connue, le nombre seul, comme sous le nom.
    expect(screen.getByRole('option', { name: `Lobe, ${none}` })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Claude, 0 projet' })).toBeNull()
  })
})
