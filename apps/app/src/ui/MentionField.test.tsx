// Tests du champ qui propose des membres à mentionner (tranche 6b, puis R5b). Après « @ » et 2
// caractères, le champ dit ce qu'il cherche (onQueryChange), replié comme l'API le replie (« @Lé »
// cherche « le » : sans accents ni majuscules, `foldForSearch`) ; l'écran lui rend des suggestions,
// et lui dit à quelle recherche elles répondent (`suggestionsFor`). Le champ les montre dans une liste
// accessible (« combobox » : un champ et sa liste de choix), au-dessus du champ dans la feuille des
// commentaires (`suggestionsPlacement: 'above'`), sous un titre (« Mentionner quelqu'un »), les
// lettres tapées en gras dans le nom et le pseudo. On choisit au toucher, ou au clavier (flèches,
// Entrée) ; Échap referme la liste. Le pseudo choisi s'écrit dans le texte.
//
// Changé en R5b (relecture du plan, ui-B6) : le champ ne trie plus les suggestions par pseudo (l'API
// trouve aussi un membre par son nom, ou un mot de son nom : « @le » trouve Hugo Lefèvre, @hugo_l) ;
// la garde contre une réponse périmée passe par `suggestionsFor`. L'ancien test « keeps only the
// members who still match while the next answer is on its way » devient « does not show suggestions
// answered for an older query, and Enter chooses nothing ».
import { foldForSearch, MENTION_QUERY_MAX, type Mentionable } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { inesMember, inikoMember } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MentionField, mentionAt } from './MentionField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un membre proposé, tel que l'écran le passe au composant : la photo déjà prête (ou aucune). */
const suggestionOf = ({ id, name, handle }: Mentionable) => ({ id, name, handle, avatar: null })
const ines = suggestionOf(inesMember)
const iniko = suggestionOf(inikoMember)
/** Trouvés pour « @le » : Léa par le début de son nom et de son pseudo, Hugo par un mot du nom. */
const lea = suggestionOf({ id: 'u1', name: 'Léa Moreau', handle: 'lea_moreau', avatarUrl: null })
const hugo = suggestionOf({ id: 'u7', name: 'Hugo Lefèvre', handle: 'hugo_l', avatarUrl: null })

const LABEL = 'Ton commentaire'
const LIST = 'Membres à mentionner'
const TITLE = fr.t(($) => $.mentions.title)

type Suggestion = ReturnType<typeof suggestionOf>

/**
 * Le champ, avec son texte gardé comme dans un écran, les suggestions choisies par le test, et la
 * recherche à laquelle elles répondent (par défaut « in », celle d'Inès et d'Iniko).
 */
function Field({
  suggestions = [ines, iniko],
  suggestionsFor = 'in',
  onQueryChange = () => {},
  initial = '',
  placement,
  title,
}: {
  suggestions?: Suggestion[]
  suggestionsFor?: string | null
  onQueryChange?: (query: string | null) => void
  initial?: string
  placement?: 'above' | 'below'
  title?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <MentionField
      label={LABEL}
      value={value}
      onChangeText={setValue}
      suggestions={suggestions}
      suggestionsFor={suggestionsFor}
      suggestionsLabel={LIST}
      onQueryChange={onQueryChange}
      multiline
      {...(placement ? { suggestionsPlacement: placement } : null)}
      {...(title ? { suggestionsTitle: title } : null)}
    />
  )
}

const field = () => screen.getByLabelText(LABEL)
const type = (text: string) => fireEvent.changeText(field(), text)
/** Une touche tapée dans le champ (sur le web, elle arrive par onKeyPress). */
const key = (name: string) =>
  fireEvent(field(), 'keyPress', { nativeEvent: { key: name, preventDefault: jest.fn() } })

/** Le dernier « ce que je cherche » annoncé par le champ. */
const lastQuery = (onQueryChange: jest.Mock) => onQueryChange.mock.calls.at(-1)?.[0]

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[]; parent?: Node | null }

/** Les nœuds de l'arbre dans l'ordre de lecture (en profondeur, de haut en bas). */
const readingOrder = (): Node[] => {
  const found: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** Le premier nœud vient-il avant le second, dans l'ordre de l'arbre (donc de lecture) ? */
const comesBefore = (first: unknown, second: unknown) => {
  const order = readingOrder()
  const a = order.indexOf(first as Node)
  const b = order.indexOf(second as Node)
  expect(a).toBeGreaterThanOrEqual(0)
  expect(b).toBeGreaterThanOrEqual(0)
  return a < b
}

/** Tout le texte d'un nœud rendu, ses enfants compris. */
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/**
 * Les parties en gras d'un texte rendu : ses enfants qui sont des éléments (des textes imbriqués,
 * comme `HighlightedText`), dans l'ordre ; le texte nu entre eux ne l'est pas. On ne lit aucun style.
 */
const marks = (shown: string): string[] => {
  const found = screen.getAllByText(shown)
  expect(found).toHaveLength(1)
  const node = found[0] as unknown as Node
  return node.children.filter((child): child is Node => typeof child !== 'string').map(textOf)
}

describe('mentionAt', () => {
  it("mentionAt('Merci @Lé', 9) returns { start: 6, query: 'le' }", () => {
    expect(mentionAt('Merci @Lé', 9)).toEqual({ start: 6, query: 'le' })
  })

  it('folds any letter, not only the Latin ones (« @Жа »)', () => {
    expect(mentionAt('Привет @Жа', 10)).toEqual({ start: 7, query: foldForSearch('Жа') })
  })

  it('finds where « @Lé » starts after an emoji, in the units of the text', () => {
    // 🐝 compte pour deux unités (UTF-16, celles de `slice`) : « @ » est à la place 3.
    const text = '🐝 @Lé'
    expect(mentionAt(text, text.length)).toEqual({ start: 3, query: 'le' })
  })

  it('looks only between 2 and MENTION_QUERY_MAX characters after « @ »', () => {
    const longest = `@${'a'.repeat(MENTION_QUERY_MAX)}`
    const tooLong = `@${'a'.repeat(MENTION_QUERY_MAX + 1)}`
    expect(mentionAt('@L', 2)).toBeNull()
    expect(mentionAt(longest, longest.length)).toEqual({
      start: 0,
      query: 'a'.repeat(MENTION_QUERY_MAX),
    })
    expect(mentionAt(tooLong, tooLong.length)).toBeNull()
  })

  it('does not take an e-mail address for a mention', () => {
    expect(mentionAt('contact@lea', 11)).toBeNull()
  })
})

describe('MentionField', () => {
  it('starts looking from 2 characters after « @ »', async () => {
    const onQueryChange = jest.fn()
    await renderWithProviders(<Field onQueryChange={onQueryChange} />)

    await type('Bravo @i')
    expect(lastQuery(onQueryChange) ?? null).toBeNull()
    await type('Bravo @in')
    expect(lastQuery(onQueryChange)).toBe('in')
    await type('Bravo @ine')
    expect(lastQuery(onQueryChange)).toBe('ine')
  })

  it('looks for « @Lé » as « le », without accents nor capitals', async () => {
    const onQueryChange = jest.fn()
    await renderWithProviders(<Field onQueryChange={onQueryChange} />)

    await type('Merci @Lé')

    expect(lastQuery(onQueryChange)).toBe('le')
  })

  it('stops looking once the word after « @ » is over', async () => {
    const onQueryChange = jest.fn()
    await renderWithProviders(<Field onQueryChange={onQueryChange} />)

    await type('Bravo @in')
    expect(lastQuery(onQueryChange)).toBe('in')
    await type('Bravo @in ')

    expect(lastQuery(onQueryChange)).toBeNull()
    expect(screen.queryByLabelText(LIST)).toBeNull()
  })

  it('does not take an e-mail address for a mention', async () => {
    const onQueryChange = jest.fn()
    await renderWithProviders(<Field onQueryChange={onQueryChange} />)

    await type('Écris à contact@ines')

    expect(lastQuery(onQueryChange) ?? null).toBeNull()
    expect(screen.queryByLabelText(LIST)).toBeNull()
    // Témoin : une vraie mention, plus loin dans le même texte, est bien cherchée.
    await type('Écris à contact@ines ou à @in')
    expect(lastQuery(onQueryChange)).toBe('in')
  })

  it('shows no list before 2 characters, even with suggestions at hand', async () => {
    await renderWithProviders(<Field />)

    await type('Bravo @i')

    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(screen.getByRole('combobox', { name: LABEL, expanded: false })).toBeTruthy()
  })

  it('lists the suggestions with their name and handle, in an accessible list', async () => {
    await renderWithProviders(<Field />)

    await type('Bravo @in')

    expect(screen.getByRole('combobox', { name: LABEL, expanded: true })).toBeTruthy()
    expect(screen.getByLabelText(LIST)).toBeTruthy()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(screen.getByRole('option', { name: /Inès Morel.*@ines_morel/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Iniko Diallo.*@iniko/ })).toBeTruthy()
  })

  it('shows a member found by a word of their name whose handle does not start with the query', async () => {
    await renderWithProviders(<Field suggestions={[lea, hugo]} suggestionsFor="le" />)

    await type('Merci @Le')

    // Hugo Lefèvre (@hugo_l) : trouvé par « Lefèvre », l'API l'a rendu, le champ le montre.
    expect(screen.getByRole('option', { name: /Hugo Lefèvre.*@hugo_l/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Léa Moreau.*@lea_moreau/ })).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('shows no list when nobody matches', async () => {
    await renderWithProviders(<Field suggestions={[]} suggestionsFor="zz" />)

    await type('Bravo @zz')

    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(screen.getByRole('combobox', { name: LABEL, expanded: false })).toBeTruthy()
  })

  it('writes the chosen handle in the text when a suggestion is touched', async () => {
    const onQueryChange = jest.fn()
    await renderWithProviders(<Field onQueryChange={onQueryChange} />)

    await type('Bravo @in')
    await fireEvent.press(screen.getByRole('option', { name: /Inès Morel/ }))

    // Le début tapé (« @in ») devient le pseudo entier, suivi d'une espace pour continuer.
    expect(field()).toHaveDisplayValue('Bravo @ines_morel ')
    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(lastQuery(onQueryChange)).toBeNull()
  })

  it('writes the handle of a member found by their name, replacing what was typed', async () => {
    await renderWithProviders(<Field suggestions={[lea, hugo]} suggestionsFor="le" />)

    await type('Merci @Lé')
    await fireEvent.press(screen.getByRole('option', { name: /Léa Moreau/ }))

    // « @Lé » devient « @lea_moreau », suivi d'une espace (scénario « Les mentions »).
    expect(field()).toHaveDisplayValue('Merci @lea_moreau ')
  })

  it('keeps the text written before the mention', async () => {
    await renderWithProviders(<Field initial="" />)

    await type('Merci @in')
    await fireEvent.press(screen.getByRole('option', { name: /Iniko Diallo/ }))

    expect(field()).toHaveDisplayValue('Merci @iniko ')
  })

  it('shows the suggestions under the field by default', async () => {
    await renderWithProviders(<Field />)

    await type('Bravo @in')

    expect(comesBefore(field(), screen.getByLabelText(LIST))).toBe(true)
  })

  it('shows the suggestions above the field when asked, as in the comments sheet', async () => {
    await renderWithProviders(<Field placement="above" />)

    await type('Bravo @in')

    // Au-dessus : la liste vient avant le champ, à l'œil comme dans l'ordre de lecture.
    expect(comesBefore(screen.getByLabelText(LIST), field())).toBe(true)
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('titles the open list « Mentionner quelqu’un » when given a title', async () => {
    await renderWithProviders(<Field placement="above" title={TITLE} />)

    // Fermée, la liste n'a pas de titre à montrer.
    await type('Bravo @i')
    expect(screen.queryByText(TITLE)).toBeNull()

    await type('Bravo @in')
    expect(screen.getByText(TITLE)).toBeTruthy()
  })

  it('marks in bold the typed letters, in the name and in the handle', async () => {
    await renderWithProviders(<Field suggestions={[lea, hugo]} suggestionsFor="le" />)

    await type('Merci @Le')

    // « le » replié : « Lé » de Léa, « le » de lea_moreau, « Le » de Lefèvre ; rien dans hugo_l.
    expect(marks('Léa Moreau')).toEqual(['Lé'])
    expect(marks('@lea_moreau')).toEqual(['le'])
    expect(marks('Hugo Lefèvre')).toEqual(['Le'])
    expect(marks('@hugo_l')).toEqual([])
  })
})

describe('MentionField with a keyboard (web)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('moves through the suggestions with the arrows, and chooses with Enter', async () => {
    await renderWithProviders(<Field />)
    await type('Bravo @in')

    // Le premier membre est en surbrillance d'emblée (Entrée le prendrait).
    expect(screen.getByRole('option', { name: /Inès Morel/, selected: true })).toBeTruthy()
    await key('ArrowDown')
    expect(screen.getByRole('option', { name: /Iniko Diallo/, selected: true })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Inès Morel/, selected: false })).toBeTruthy()
    await key('ArrowUp')
    expect(screen.getByRole('option', { name: /Inès Morel/, selected: true })).toBeTruthy()
    await key('Enter')

    expect(field()).toHaveDisplayValue('Bravo @ines_morel ')
    expect(screen.queryByLabelText(LIST)).toBeNull()
  })

  it('closes the list with Escape, leaving the text as it was', async () => {
    await renderWithProviders(<Field />)
    await type('Bravo @in')
    expect(screen.getByLabelText(LIST)).toBeTruthy()

    await key('Escape')

    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(field()).toHaveDisplayValue('Bravo @in')
  })

  it('opens the list again after Escape at the next letter', async () => {
    await renderWithProviders(<Field suggestions={[ines]} suggestionsFor="ine" />)
    await type('Bravo @ine')
    await key('Escape')
    expect(screen.queryByLabelText(LIST)).toBeNull()

    // Une lettre de moins, puis de nouveau « ine » : la liste revient.
    await type('Bravo @in')
    await type('Bravo @ine')

    expect(screen.getByLabelText(LIST)).toBeTruthy()
  })

  it('chooses the first member with Enter, without the arrows', async () => {
    await renderWithProviders(<Field />)
    await type('Bravo @in')

    await key('Enter')

    expect(field()).toHaveDisplayValue('Bravo @ines_morel ')
  })

  it('chooses nobody from an older answer while the new one is on its way', async () => {
    // Les suggestions restent celles de « @in » (la réponse pour « @ma » n'est pas arrivée).
    await renderWithProviders(<Field />)
    await type('Bravo @in')
    await key('Enter')
    expect(field()).toHaveDisplayValue('Bravo @ines_morel ')

    await type('Bravo @ines_morel @ma')
    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(screen.getByRole('combobox', { name: LABEL, expanded: false })).toBeTruthy()
    await key('ArrowDown')
    await key('Enter')

    expect(field()).toHaveDisplayValue('Bravo @ines_morel @ma')
  })

  it('does not show suggestions answered for an older query, and Enter chooses nothing', async () => {
    // Inès et Iniko répondaient à « @in » ; on tape « @ine », la réponse n'est pas encore là. Même
    // si Inès pourrait encore convenir, la liste attend la bonne réponse.
    await renderWithProviders(<Field suggestionsFor="in" />)

    await type('Bravo @ine')

    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('combobox', { name: LABEL, expanded: false })).toBeTruthy()
    await key('Enter')
    expect(field()).toHaveDisplayValue('Bravo @ine')
  })

  it('closes the list on Tab, and lets Tab go on to the next button', async () => {
    await renderWithProviders(<Field />)
    await type('Bravo @in')
    const preventDefault = jest.fn()

    await fireEvent(field(), 'keyPress', { nativeEvent: { key: 'Tab', preventDefault } })

    expect(screen.queryByLabelText(LIST)).toBeNull()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(field()).toHaveDisplayValue('Bravo @in')
  })

  it('keeps the suggestions out of the Tab order', async () => {
    await renderWithProviders(<Field />)
    await type('Bravo @in')

    for (const option of screen.getAllByRole('option')) expect(option).toHaveProp('tabIndex', -1)
  })
})
