// Tests du champ des outils d'un projet (tranche R6a, planche `R6-Publier-Outils`, relecture du plan
// ui-B4) : « Outils 2 / 15 », les outils choisis en pastilles qu'une croix retire, et un champ de
// recherche qui propose des outils avec leur nombre de projets (« Claude · 41 projets », lu
// « Claude, 41 projets ») ; jamais plus de 15 outils.
//
// Le champ reprend le motif « combobox » de `MentionField` et `SuggestionList`, avec leurs gardes de
// la tranche 6b : le champ garde le focus, la liste (rôle « listbox ») lui est liée, le premier choix
// est en surbrillance, les flèches parcourent, Entrée choisit, et Échap ne ferme que la liste (la
// touche est « prise », `preventDefault`, pour que la feuille autour ne se ferme pas avec elle ; un
// second Échap, la liste fermée, lui revient).
//
// R6b (scénario « Choisir ses outils », relecture du plan ui-B3, ui-B4 et point 15 des décisions) :
// les suggestions viennent du catalogue normé, chacune avec sa famille (« Claude · Assistant IA ·
// 41 projets »). Un nom absent du catalogue s'ajoute « comme autre outil » : sa pastille est marquée
// « Autre », lue « Teachable Machine, autre outil, pas encore dans le catalogue », et une aide liée
// au champ dit que les administrateurs relisent ces noms. Tant que le catalogue n'est pas lu (ou en
// panne), la ligne reste neutre (« Ajouter « X » »), sans marque. Un nom du catalogue ou un de ses
// alias (« gpt-4 » pour ChatGPT) ne se propose jamais comme autre outil. Deux écritures d'un même
// outil (« Chat GPT » et « ChatGPT ») sont le même choix, au repli `foldTool` près.
//
// L'API du composant (découpage amendé de R6b, U1, rapport `ui-reviewer` « API proposée ») :
// ToolField({ label; values: string[]; onChange(values); suggestions: { name; uses; family: string |
// null }[]; onQuery(q); limit; labels; known; catalogueReady; isOther(name); allowOther?; error?;
// inputRef? }), avec labels = { search; suggestions; chosen; counter(count, max) → { shown; spoken };
// uses(count); suggestion(name, count); add(name); remove(name); detail(family, count);
// addOther(name); otherBadge; otherSpoken(name); otherHint }.
// - `known` : ce qui est tapé est le nom ou un alias d'un outil du catalogue (`matchTools`) : aucune
//   ligne « Ajouter » ;
// - `catalogueReady` faux : ligne neutre « Ajouter « X » », aucune pastille marquée « Autre » ;
// - `isOther(name)` : cette pastille est-elle un « Autre » ;
// - `allowOther` faux (« Rattacher » de la Modération) : seulement des outils du catalogue.
import { foldTool, PROJECT_TOOLS_MAX } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { createRef, type Ref, useState } from 'react'
import { Platform, type TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToolField } from './ToolField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.project.form.tools)
const LIST = fr.t(($) => $.project.form.toolSuggestions)
/** Le nombre de projets, seul (« 41 projets »). */
const uses = (count: number) => fr.t(($) => $.project.form.toolUses, { count })
const labels = {
  search: fr.t(($) => $.project.form.toolSearch),
  suggestions: LIST,
  chosen: fr.t(($) => $.project.form.toolsChosen),
  counter: (count: number, max: number) => ({
    shown: fr.t(($) => $.project.form.toolsCount, { count, max }),
    spoken: fr.t(($) => $.project.form.toolsCountSpoken, { count, max }),
  }),
  uses,
  suggestion: (name: string, count: number) =>
    fr.t(($) => $.project.form.toolSuggestion, { name, count }),
  add: (name: string) => fr.t(($) => $.project.form.addTool, { name }),
  remove: (name: string) => fr.t(($) => $.project.form.removeTool, { name }),
  // R6b : la famille et le nombre sous un nom (« Assistant IA · 41 projets »), le nombre seul pour
  // un outil sans famille connue.
  detail: (family: string | null, count: number) =>
    family === null
      ? uses(count)
      : fr.t(($) => $.tools.detail, {
          family,
          projects: fr.t(($) => $.tools.projects, { count }),
        }),
  addOther: (name: string) => fr.t(($) => $.project.form.addOtherTool, { name }),
  otherBadge: fr.t(($) => $.tool.otherBadge),
  otherSpoken: (name: string) => fr.t(($) => $.tool.otherSpoken, { name }),
  otherHint: fr.t(($) => $.project.form.otherToolsHint),
}

type Suggestion = { name: string; uses: number; family: string | null }
const ASSISTANT = fr.t(($) => $.tools.family.assistant)
const DEVELOPMENT = fr.t(($) => $.tools.family.development)
const claude: Suggestion = { name: 'Claude', uses: 41, family: ASSISTANT }
const claudeCode: Suggestion = { name: 'Claude Code', uses: 12, family: DEVELOPMENT }
const python: Suggestion = { name: 'Python', uses: 1, family: DEVELOPMENT }
const chatgpt: Suggestion = { name: 'ChatGPT', uses: 50, family: ASSISTANT }

/** Les outils du « catalogue » de ces tests, repliés : tout autre nom est un « Autre ». */
const CATALOGUE = new Set(
  ['Claude', 'Claude Code', 'Python', 'ChatGPT', 'Chat GPT', 'GPT-4'].map(foldTool),
)
const otherByDefault = (name: string) => !CATALOGUE.has(foldTool(name))

/**
 * Le champ, avec ses outils gardés comme dans le formulaire ; `onChange` voit chaque liste reçue,
 * `onQuery` chaque recherche. Les suggestions, `known` et `isOther` sont ceux que l'écran aurait
 * calculés (par `matchTools`) ; par défaut, le catalogue est lu.
 */
function Field({
  initial = [],
  suggestions = [claude, claudeCode],
  onChange,
  onQuery = () => {},
  limit = PROJECT_TOOLS_MAX,
  known = false,
  catalogueReady = true,
  isOther = otherByDefault,
  allowOther,
  error,
  inputRef,
}: {
  initial?: string[]
  suggestions?: Suggestion[]
  onChange?: (values: string[]) => void
  onQuery?: (query: string) => void
  limit?: number
  known?: boolean
  catalogueReady?: boolean
  isOther?: (name: string) => boolean
  allowOther?: boolean
  error?: string
  inputRef?: Ref<TextInput>
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
      known={known}
      catalogueReady={catalogueReady}
      isOther={isOther}
      {...(allowOther === undefined ? null : { allowOther })}
      {...(error === undefined ? null : { error })}
      {...(inputRef === undefined ? null : { inputRef })}
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
/** « Ajouter « Teachable Machine » », la ligne neutre (espaces insécables comprises). */
const ADD_TEACHABLE = labels.add('Teachable Machine')
/** « Ajouter « Teachable Machine » comme autre outil », la ligne du catalogue lu. */
const ADD_OTHER_TEACHABLE = labels.addOther('Teachable Machine')
const OTHER = labels.otherBadge
const HINT = labels.otherHint

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent?: Host | null
}

/** Le premier `nativeID` porté par l'élément ou un de ses parents (l'identifiant d'un texte lié). */
const nativeIdAround = (node: Host | null | undefined): string | undefined => {
  for (let at = node; at; at = at.parent) {
    if (typeof at.props.nativeID === 'string') return at.props.nativeID
  }
  return undefined
}

/**
 * Ce que l'arbre montre, dans l'ordre de lecture : les textes, et « [champ] » à la place du champ
 * des outils. Pour vérifier qu'un message vient sous le champ, sans lire de style.
 */
const readingOrder = (node: Host | string): string[] => {
  if (typeof node === 'string') return [node]
  if (node.props.role === 'combobox' || node.props.accessibilityRole === 'combobox') {
    return ['[champ]']
  }
  return node.children.flatMap(readingOrder)
}

describe('ToolField texts', () => {
  it('composes the names from the translations (witness)', () => {
    expect(labels.suggestion('Claude', 41)).toBe('Claude, 41 projets')
    expect(labels.suggestion('Python', 1)).toBe('Python, 1 projet')
    expect(labels.uses(41)).toBe('41 projets')
    expect(ADD_TEACHABLE).toMatch(/^Ajouter «\s?Teachable Machine\s?»$/)
    expect(ADD_OTHER_TEACHABLE).toMatch(/^Ajouter «\s?Teachable Machine\s?» comme autre outil$/)
    expect(labels.remove('Claude')).toBe('Retirer Claude')
    expect(labels.counter(2, 15)).toEqual({ shown: '2 / 15', spoken: '2 outils choisis sur 15' })
    expect(labels.detail(ASSISTANT, 41)).toBe('Assistant IA · 41 projets')
    expect(labels.otherSpoken('Teachable Machine')).toBe(
      'Teachable Machine, autre outil, pas encore dans le catalogue',
    )
    expect(OTHER).toBe('Autre')
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
    expect(screen.getByRole('option', { name: 'Claude, 41 projets' })).toBeTruthy()
    // Le singulier pour un seul projet.
    expect(screen.getByRole('option', { name: 'Python, 1 projet' })).toBeTruthy()
  })

  // R6b : « Claude · Assistant IA · 41 projets » (planche R6-Publier-Outils).
  it('shows the family and the number of projects of a suggestion, « Assistant IA · 41 projets »', async () => {
    await renderWithProviders(
      <Field suggestions={[claude, { name: 'Lobe', uses: 2, family: null }]} />,
    )
    await type('l')

    const option = screen.getByRole('option', { name: 'Claude, 41 projets' })
    expect(within(option).getByText(labels.detail(ASSISTANT, 41))).toBeTruthy()
    // Sans famille connue, le nombre seul.
    const lobe = screen.getByRole('option', { name: 'Lobe, 2 projets' })
    expect(within(lobe).getByText('2 projets')).toBeTruthy()
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

  it('offers to add a name absent from the catalogue as an other tool, as it is typed', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field suggestions={[]} onChange={onChange} />)
    await type('  Teachable Machine ')

    await fireEvent.press(screen.getByRole('option', { name: ADD_OTHER_TEACHABLE }))

    expect(onChange).toHaveBeenLastCalledWith(['Teachable Machine'])
    expect(field()).toHaveDisplayValue('')
  })

  it('does not offer to add a name already proposed, whatever its capitals', async () => {
    await renderWithProviders(<Field suggestions={[claude]} known />)
    await type('claude')

    expect(screen.getByRole('option', { name: 'Claude, 41 projets' })).toBeTruthy() // témoin
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()
  })

  it('neither proposes nor adds a tool already chosen, whatever its capitals', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <Field initial={['Claude']} suggestions={[claude, claudeCode]} onChange={onChange} known />,
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

    await fireEvent.press(screen.getByRole('option', { name: ADD_OTHER_TEACHABLE }))

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

// R6b : le catalogue, les alias et les « Autre » (relecture du plan, tests mot pour mot).
describe('ToolField with the catalogue (R6b)', () => {
  it('offers no « add as other tool » row when the typed name is an alias of a catalogue tool spelled unlike its name', async () => {
    // « gpt-4 » est un alias de ChatGPT : l'écran (matchTools) le sait et le dit par `known`.
    await renderWithProviders(<Field suggestions={[chatgpt]} known />)
    await type('gpt-4')

    expect(screen.getByRole('option', { name: 'ChatGPT, 50 projets' })).toBeTruthy() // témoin
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()
  })

  it('marks no chip as other and offers a neutral « Ajouter » row while the catalogue is loading or failed', async () => {
    // Catalogue pas encore lu : l'écran ne sait rien, chaque nom lui semble inconnu.
    await renderWithProviders(
      <Field
        initial={['Claude', 'Lobe']}
        suggestions={[]}
        catalogueReady={false}
        isOther={() => true}
      />,
    )
    await type('Teachable Machine')

    expect(screen.getByRole('option', { name: ADD_TEACHABLE })).toBeTruthy()
    expect(screen.queryByRole('option', { name: ADD_OTHER_TEACHABLE })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retirer Lobe' })).toBeTruthy() // témoin
    expect(screen.queryByText(OTHER)).toBeNull()
    expect(screen.queryByLabelText(labels.otherSpoken('Lobe'))).toBeNull()
    expect(screen.queryByLabelText(labels.otherSpoken('Claude'))).toBeNull()
  })

  it('treats « Chat GPT » and « ChatGPT » as the same chosen tool', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <Field
        initial={['Chat GPT']}
        suggestions={[chatgpt, claude]}
        onChange={onChange}
        catalogueReady={false}
      />,
    )
    // L'écran propose encore ChatGPT (sa recherche ne voit pas les choix) : le champ l'écarte.
    await type('ChatGPT')

    expect(screen.getByRole('option', { name: 'Claude, 41 projets' })).toBeTruthy() // témoin
    expect(screen.queryByRole('option', { name: 'ChatGPT, 50 projets' })).toBeNull()
    // Ni ligne neutre, ni « autre outil » : c'est déjà choisi.
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reads an other chip as « Teachable Machine, autre outil, pas encore dans le catalogue »', async () => {
    await renderWithProviders(<Field initial={['Claude', 'Teachable Machine']} />)

    const chip = screen.getByLabelText(labels.otherSpoken('Teachable Machine'))
    expect(chip).toBeTruthy()
    // La marque se voit aussi, une seule fois : Claude est au catalogue.
    expect(screen.getAllByText(OTHER)).toHaveLength(1)
    expect(screen.queryByLabelText(labels.otherSpoken('Claude'))).toBeNull()
    // La croix garde son nom.
    expect(screen.getByRole('button', { name: 'Retirer Teachable Machine' })).toBeTruthy()
  })

  it('marks the chip of an other tool once it is added', async () => {
    await renderWithProviders(<Field suggestions={[]} />)
    expect(screen.queryByText(OTHER)).toBeNull() // témoin

    await type('Teachable Machine')
    await fireEvent.press(screen.getByRole('option', { name: ADD_OTHER_TEACHABLE }))

    expect(screen.getByLabelText(labels.otherSpoken('Teachable Machine'))).toBeTruthy()
    expect(screen.getByText(OTHER)).toBeTruthy()
  })

  it('links the review hint to the field once an other tool is chosen', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Field initial={['Claude']} suggestions={[]} />)
      // Aucun « Autre » : pas d'aide.
      expect(screen.queryByText(HINT)).toBeNull()

      await type('Teachable Machine')
      await fireEvent.press(screen.getByRole('option', { name: ADD_OTHER_TEACHABLE }))

      const hint = screen.getByText(HINT) as unknown as Host
      const id = nativeIdAround(hint)
      expect(id).toBeTruthy()
      const described = String(field().props['aria-describedby'] ?? '').split(' ')
      expect(described).toContain(id)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('shows its error under the field, and inputRef gives focus to the input', async () => {
    const error = fr.t(($) => $.errors.tooManyOtherTools)
    const inputRef = createRef<TextInput>()
    await renderWithProviders(<Field initial={['Claude']} error={error} inputRef={inputRef} />)

    const order = readingOrder(screen.root as unknown as Host)
    expect(order).toContain('[champ]')
    expect(order.indexOf(error)).toBeGreaterThan(order.indexOf('[champ]'))
    // `inputRef` reçoit le champ lui-même : l'écran y pose le focus (« Enregistrer » refusé).
    expect(inputRef.current).not.toBeNull()
    expect((inputRef.current as unknown as Host).props.accessibilityLabel).toBe(
      field().props.accessibilityLabel,
    )
  })

  it('says the field is invalid while it shows an error (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const error = fr.t(($) => $.errors.tooManyOtherTools)
      await renderWithProviders(<Field error={error} />)

      expect(field().props['aria-invalid']).toBe(true)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('offers catalogue tools only when allowOther is false', async () => {
    await renderWithProviders(<Field suggestions={[claude]} allowOther={false} />)

    await type('Cla')
    expect(screen.getByRole('option', { name: 'Claude, 41 projets' })).toBeTruthy() // témoin
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()

    await type('Teachable Machine')
    expect(screen.queryByRole('option', { name: /^Ajouter/ })).toBeNull()
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

    expect(screen.getByRole('option', { name: ADD_OTHER_TEACHABLE, selected: true })).toBeTruthy()
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

  it('adds nothing with Enter when the typed name is a chosen tool written another way', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <Field initial={['ChatGPT']} suggestions={[]} onChange={onChange} catalogueReady={false} />,
    )

    await type('Chat GPT')
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
