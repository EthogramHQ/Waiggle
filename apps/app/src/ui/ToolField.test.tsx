// Tests du champ des outils d'un projet (tranche R6a, planche `R6-Publier-Outils`, relecture du plan
// ui-B4) : « Outils 2 / 15 », les outils choisis en pastilles qu'une croix retire, et un champ de
// recherche qui propose les outils déjà utilisés par les membres, avec leur nombre de projets
// (« Claude · 41 projets », lu « Claude, 41 projets »). Un nom absent s'ajoute tel quel
// (« Ajouter « Teachable Machine » »), comme aujourd'hui ; jamais plus de 15 outils.
//
// Le champ reprend le motif « combobox » de `MentionField` et `SuggestionList`, avec leurs gardes de
// la tranche 6b : le champ garde le focus, la liste (rôle « listbox ») lui est liée, le premier choix
// est en surbrillance, les flèches parcourent, Entrée choisit, et Échap ne ferme que la liste (la
// touche est « prise », `preventDefault`, pour que la feuille autour ne se ferme pas avec elle ; un
// second Échap, la liste fermée, lui revient).
//
// L'API du composant (découpage amendé de R6a, U7, complétée par ce fichier) :
// ToolField({ label; values: string[]; onChange(values); suggestions: { name; uses }[]; onQuery(q);
// limit; labels }), avec labels = { search; suggestions; chosen; counter(count, max) → { shown;
// spoken }; uses(count); suggestion(name, count); add(name); remove(name) }. Le champ (combobox) est
// nommé par `label` ; la liste des suggestions par `labels.suggestions`. L'écran cherche les
// suggestions d'après `onQuery` (ce qui est tapé) ; le champ les montre telles quelles, sauf celles
// déjà choisies.
import { PROJECT_TOOLS_MAX } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToolField } from './ToolField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.project.form.tools)
const LIST = fr.t(($) => $.project.form.toolSuggestions)
const labels = {
  search: fr.t(($) => $.project.form.toolSearch),
  suggestions: LIST,
  chosen: fr.t(($) => $.project.form.toolsChosen),
  counter: (count: number, max: number) => ({
    shown: fr.t(($) => $.project.form.toolsCount, { count, max }),
    spoken: fr.t(($) => $.project.form.toolsCountSpoken, { count, max }),
  }),
  uses: (count: number) => fr.t(($) => $.project.form.toolUses, { count }),
  suggestion: (name: string, count: number) =>
    fr.t(($) => $.project.form.toolSuggestion, { name, count }),
  add: (name: string) => fr.t(($) => $.project.form.addTool, { name }),
  remove: (name: string) => fr.t(($) => $.project.form.removeTool, { name }),
}

type Suggestion = { name: string; uses: number }
const claude = { name: 'Claude', uses: 41 }
const claudeCode = { name: 'Claude Code', uses: 12 }
const python = { name: 'Python', uses: 1 }

/**
 * Le champ, avec ses outils gardés comme dans le formulaire ; `onChange` voit chaque liste reçue,
 * `onQuery` chaque recherche. Les suggestions sont celles que l'écran aurait trouvées.
 */
function Field({
  initial = [],
  suggestions = [claude, claudeCode],
  onChange,
  onQuery = () => {},
  limit = PROJECT_TOOLS_MAX,
}: {
  initial?: string[]
  suggestions?: Suggestion[]
  onChange?: (values: string[]) => void
  onQuery?: (query: string) => void
  limit?: number
}) {
  const [values, setValues] = useState(initial)
  return (
    <ToolField
      label={LABEL}
      values={values}
      onChange={(next) => {
        onChange?.(next)
        setValues(next)
      }}
      suggestions={suggestions}
      onQuery={onQuery}
      limit={limit}
      labels={labels}
    />
  )
}

const field = () => screen.getByRole('combobox', { name: LABEL })
const type = (text: string) => fireEvent.changeText(field(), text)
/** Une touche tapée dans le champ (sur le web, elle arrive par onKeyPress) ; rend son preventDefault. */
const key = async (name: string) => {
  const preventDefault = jest.fn()
  await fireEvent(field(), 'keyPress', { nativeEvent: { key: name, preventDefault } })
  return preventDefault
}

/** Quinze outils déjà choisis : la limite du contrat. */
const fifteen = Array.from({ length: PROJECT_TOOLS_MAX }, (_, i) => `Outil ${i + 1}`)
/** « Ajouter « Teachable Machine » », fabriqué par les traductions (espaces insécables comprises). */
const ADD_TEACHABLE = labels.add('Teachable Machine')

describe('ToolField texts', () => {
  it('composes the names from the translations (witness)', () => {
    expect(labels.suggestion('Claude', 41)).toBe('Claude, 41 projets')
    expect(labels.suggestion('Python', 1)).toBe('Python, 1 projet')
    expect(labels.uses(41)).toBe('41 projets')
    expect(ADD_TEACHABLE).toMatch(/^Ajouter «\s?Teachable Machine\s?»$/)
    expect(labels.remove('Claude')).toBe('Retirer Claude')
    expect(labels.counter(2, 15)).toEqual({ shown: '2 / 15', spoken: '2 outils choisis sur 15' })
  })
})

describe('ToolField', () => {
  it('is a combobox named by its label, closed before anything is typed', async () => {
    await renderWithProviders(<Field />)

    expect(screen.getByRole('combobox', { name: LABEL, expanded: false })).toBeTruthy()
    expect(screen.queryByLabelText(LIST)).toBeNull()
  })

  it('tells the screen what is typed, so that it can look for tools', async () => {
    const onQuery = jest.fn()
    await renderWithProviders(<Field onQuery={onQuery} />)

    await type('Cla')

    expect(onQuery).toHaveBeenLastCalledWith('Cla')
  })

  it('names each suggestion with its number of projects, « Claude, 41 projets »', async () => {
    await renderWithProviders(<Field suggestions={[claude, python]} />)
    await type('Cl')

    expect(screen.getByRole('combobox', { name: LABEL, expanded: true })).toBeTruthy()
    expect(screen.getByLabelText(LIST)).toBeTruthy()
    const option = screen.getByRole('option', { name: 'Claude, 41 projets' })
    // Le nombre se voit aussi : « Claude · 41 projets ».
    expect(within(option).getByText('41 projets')).toBeTruthy()
    // Le singulier pour un seul projet.
    expect(screen.getByRole('option', { name: 'Python, 1 projet' })).toBeTruthy()
  })

  it('adds the touched suggestion and empties the field', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field initial={['Python']} onChange={onChange} />)
    await type('Cl')

    await fireEvent.press(screen.getByRole('option', { name: 'Claude, 41 projets' }))

    expect(onChange).toHaveBeenLastCalledWith(['Python', 'Claude'])
    expect(field()).toHaveDisplayValue('')
    expect(screen.queryByLabelText(LIST)).toBeNull()
  })

  it('offers to add a name nobody has used yet, as it is typed', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field suggestions={[]} onChange={onChange} />)
    await type('  Teachable Machine ')

    await fireEvent.press(screen.getByRole('option', { name: ADD_TEACHABLE }))

    expect(onChange).toHaveBeenLastCalledWith(['Teachable Machine'])
    expect(field()).toHaveDisplayValue('')
  })

  it('does not offer to add a name already proposed, whatever its capitals', async () => {
    await renderWithProviders(<Field suggestions={[claude]} />)
    await type('claude')

    expect(screen.getByRole('option', { name: 'Claude, 41 projets' })).toBeTruthy() // témoin
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()
  })

  it('neither proposes nor adds a tool already chosen, whatever its capitals', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <Field initial={['Claude']} suggestions={[claude, claudeCode]} onChange={onChange} />,
    )
    await type('claude')

    expect(screen.getByRole('option', { name: 'Claude Code, 12 projets' })).toBeTruthy() // témoin
    expect(screen.queryByRole('option', { name: 'Claude, 41 projets' })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()
  })

  it('removes a chosen tool from a button named « Retirer Claude »', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field initial={['Claude', 'Python']} onChange={onChange} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Claude' }))

    expect(onChange).toHaveBeenLastCalledWith(['Python'])
    expect(screen.queryByRole('button', { name: 'Retirer Claude' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retirer Python' })).toBeTruthy()
  })

  it('shows « 2 / 15 » and reads « 2 outils choisis sur 15 »', async () => {
    await renderWithProviders(<Field initial={['Claude', 'Python']} />)

    expect(screen.getByText('2 / 15')).toBeTruthy()
    expect(screen.getByLabelText('2 outils choisis sur 15')).toBeTruthy()
  })

  it('still adds the fifteenth tool (witness of the limit)', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <Field initial={fifteen.slice(0, -1)} suggestions={[]} onChange={onChange} />,
    )
    await type('Teachable Machine')

    await fireEvent.press(screen.getByRole('option', { name: ADD_TEACHABLE }))

    expect(onChange).toHaveBeenLastCalledWith([...fifteen.slice(0, -1), 'Teachable Machine'])
  })

  it('proposes and adds nothing once 15 tools are chosen', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <Field initial={fifteen} suggestions={[claude]} onChange={onChange} />,
    )

    expect(screen.getByText('15 / 15')).toBeTruthy() // témoin
    // Le champ peut refuser la saisie, ou n'offrir aucun choix : dans les deux cas, rien ne s'ajoute.
    // (un champ qui refuse la saisie ignore ce `changeText`).
    await type('Cla')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('ToolField with a keyboard (web)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('moves through the suggestions with the arrows, and adds with Enter', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field onChange={onChange} />)
    await type('Claude')

    // Le premier outil est en surbrillance d'emblée (Entrée le prendrait).
    expect(screen.getByRole('option', { name: 'Claude, 41 projets', selected: true })).toBeTruthy()
    await key('ArrowDown')
    expect(
      screen.getByRole('option', { name: 'Claude Code, 12 projets', selected: true }),
    ).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Claude, 41 projets', selected: false })).toBeTruthy()
    await key('ArrowUp')
    expect(screen.getByRole('option', { name: 'Claude, 41 projets', selected: true })).toBeTruthy()
    await key('ArrowDown')
    const enter = await key('Enter')

    expect(onChange).toHaveBeenLastCalledWith(['Claude Code'])
    // Entrée ajoute, sans rien envoyer d'autre (le formulaire autour ne se publie pas).
    expect(enter).toHaveBeenCalled()
    expect(field()).toHaveDisplayValue('')
  })

  it('adds a new name with Enter when it is the only choice', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field suggestions={[]} onChange={onChange} />)
    await type('Teachable Machine')

    expect(screen.getByRole('option', { name: ADD_TEACHABLE, selected: true })).toBeTruthy()
    await key('Enter')

    expect(onChange).toHaveBeenLastCalledWith(['Teachable Machine'])
  })

  it('closes only the list with Escape, keeping the text, and lets the next Escape through', async () => {
    await renderWithProviders(<Field />)
    await type('Claude')
    expect(screen.getByLabelText(LIST)).toBeTruthy() // témoin

    const first = await key('Escape')

    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(field()).toHaveDisplayValue('Claude')
    expect(screen.getByRole('combobox', { name: LABEL, expanded: false })).toBeTruthy()
    // La touche est prise : la feuille autour ne se ferme pas avec la liste.
    expect(first).toHaveBeenCalled()

    // La liste fermée, Échap revient à la feuille (« Catégorie et outils » se referme).
    const second = await key('Escape')
    expect(second).not.toHaveBeenCalled()
  })

  it('adds nothing with Enter once 15 tools are chosen', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field initial={fifteen} suggestions={[]} onChange={onChange} />)

    await type('Teachable Machine')
    await key('Enter')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the suggestions out of the Tab order', async () => {
    await renderWithProviders(<Field />)
    await type('Claude')

    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(0) // témoin
    for (const option of options) expect(option).toHaveProp('tabIndex', -1)
  })

  it('links the field to the list and to the highlighted suggestion', async () => {
    await renderWithProviders(<Field />)
    await type('Claude')

    const list = screen.getByLabelText(LIST)
    const listId = list.props.nativeID as string
    expect(listId).toBeTruthy()
    expect(field().props['aria-controls']).toBe(listId)
    const highlighted = screen.getByRole('option', { name: 'Claude, 41 projets', selected: true })
    expect(field().props['aria-activedescendant']).toBe(highlighted.props.nativeID)
  })
})
