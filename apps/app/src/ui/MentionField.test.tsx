// Tests du champ qui propose des membres à mentionner (tranche 6b). Après « @ » et 2 caractères,
// le champ dit ce qu'il cherche (onQueryChange) ; l'écran lui rend des suggestions, qu'il montre
// dans une liste accessible (« combobox » : un champ et sa liste de choix). On choisit au toucher,
// ou au clavier (flèches, Entrée) ; Échap referme la liste. Le pseudo choisi s'écrit dans le texte.
import type { Mentionable } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { inesMember, inikoMember } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { MentionField } from './MentionField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un membre proposé, tel que l'écran le passe au composant : la photo déjà prête (ou aucune). */
const suggestionOf = ({ id, name, handle }: Mentionable) => ({ id, name, handle, avatar: null })
const ines = suggestionOf(inesMember)
const iniko = suggestionOf(inikoMember)

const LABEL = 'Ton commentaire'
const LIST = 'Membres à mentionner'

/** Le champ, avec son texte gardé comme dans un écran, et les suggestions choisies par le test. */
function Field({
  suggestions = [ines, iniko],
  onQueryChange = () => {},
  initial = '',
}: {
  suggestions?: ReturnType<typeof suggestionOf>[]
  onQueryChange?: (query: string | null) => void
  initial?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <MentionField
      label={LABEL}
      value={value}
      onChangeText={setValue}
      suggestions={suggestions}
      suggestionsLabel={LIST}
      onQueryChange={onQueryChange}
      multiline
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

  it('shows no list when nobody matches', async () => {
    await renderWithProviders(<Field suggestions={[]} />)

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

  it('keeps the text written before the mention', async () => {
    await renderWithProviders(<Field initial="" />)

    await type('Merci @in')
    await fireEvent.press(screen.getByRole('option', { name: /Iniko Diallo/ }))

    expect(field()).toHaveDisplayValue('Merci @iniko ')
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
    // Une lettre de plus : la liste revient.
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

  it('keeps only the members who still match while the next answer is on its way', async () => {
    await renderWithProviders(<Field />)

    await type('Bravo @ine')

    // Iniko répondait à « @in », plus à « @ine ».
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /Inès Morel/ })).toBeTruthy()
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
