// Tests du champ des outils, en plus de ToolField.test.tsx (tranche R6a, décisions prises en cours
// de tranche) :
// - champ vide, le focus ouvre la liste avec ce que l'écran propose (les outils les plus utilisés),
//   sans rien mettre en surbrillance : Entrée n'ajoute pas un outil qu'on n'a pas demandé ;
// - après le retrait d'un outil, le focus va à la croix de la pastille suivante, sinon de la
//   précédente, sinon au champ de recherche (il ne retombe jamais en haut de la page).
import { PROJECT_TOOLS_MAX } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToolField, type ToolFieldLabels } from './ToolField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.project.form.tools)
const LIST = fr.t(($) => $.project.form.toolSuggestions)
const labels: ToolFieldLabels = {
  search: fr.t(($) => $.project.form.toolSearch),
  suggestions: LIST,
  chosen: fr.t(($) => $.project.form.toolsChosen),
  counter: (count, max) => ({
    shown: fr.t(($) => $.project.form.toolsCount, { count, max }),
    spoken: fr.t(($) => $.project.form.toolsCountSpoken, { count, max }),
  }),
  uses: (count) => fr.t(($) => $.project.form.toolUses, { count }),
  suggestion: (name, count) => fr.t(($) => $.project.form.toolSuggestion, { name, count }),
  add: (name) => fr.t(($) => $.project.form.addTool, { name }),
  remove: (name) => fr.t(($) => $.project.form.removeTool, { name }),
}

const popular = [
  { name: 'Claude', uses: 41 },
  { name: 'Python', uses: 9 },
]

function Field({
  initial = [],
  onChange,
}: {
  initial?: string[]
  onChange?: (values: string[]) => void
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
      suggestions={popular}
      onQuery={() => {}}
      limit={PROJECT_TOOLS_MAX}
      labels={labels}
    />
  )
}

const field = () => screen.getByRole('combobox', { name: LABEL })

describe('ToolField, empty and focused', () => {
  it('opens the most used tools on focus, without highlighting one', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onChange = jest.fn()
    try {
      await renderWithProviders(<Field onChange={onChange} />)
      expect(screen.queryByLabelText(LIST)).toBeNull() // témoin : fermée avant le focus

      await fireEvent(field(), 'focus')

      expect(screen.getByLabelText(LIST)).toBeTruthy()
      expect(
        screen.getByRole('option', { name: 'Claude, 41 projets', selected: false }),
      ).toBeTruthy()
      expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0)
      expect(field().props['aria-activedescendant']).toBeUndefined()
      // Entrée, rien en surbrillance : rien ne s'ajoute.
      await fireEvent(field(), 'keyPress', { nativeEvent: { key: 'Enter', preventDefault() {} } })
      expect(onChange).not.toHaveBeenCalled()
      // Une flèche met le premier en surbrillance ; Entrée le prend alors.
      await fireEvent(field(), 'keyPress', {
        nativeEvent: { key: 'ArrowDown', preventDefault() {} },
      })
      expect(
        screen.getByRole('option', { name: 'Claude, 41 projets', selected: true }),
      ).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('closes on blur', async () => {
    await renderWithProviders(<Field />)
    await fireEvent(field(), 'focus')
    expect(screen.getByLabelText(LIST)).toBeTruthy() // témoin

    await fireEvent(field(), 'blur')

    expect(screen.queryByLabelText(LIST)).toBeNull()
  })
})

describe('ToolField, focus after a removal (web)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  /**
   * Rend le champ, retire `remove` par sa croix, et rend le nom de chaque vue qui a reçu le focus :
   * on écoute `focus` sur le prototype des vues natives (une vue témoin le donne).
   */
  const focusAfterRemoving = async (initial: string[], remove: string) => {
    const probe = createRef<View>()
    await renderWithProviders(
      <>
        <View ref={probe} />
        <Field initial={initial} />
      </>,
    )
    const proto = Object.getPrototypeOf(probe.current) as { focus?: unknown }
    const hadFocus = Object.hasOwn(proto, 'focus')
    const original = proto.focus
    if (typeof proto.focus !== 'function') proto.focus = () => {}
    const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
    focus.mockClear()
    try {
      await fireEvent.press(screen.getByRole('button', { name: `Retirer ${remove}` }))
      return focus.mock.contexts.map(labelOf)
    } finally {
      focus.mockRestore()
      if (hadFocus) proto.focus = original
      else delete proto.focus
    }
  }

  it('moves the focus to the next chip', async () => {
    expect(await focusAfterRemoving(['Claude', 'Expo', 'Python'], 'Expo')).toEqual([
      'Retirer Python',
    ])
  })

  it('moves the focus to the previous chip after the last one', async () => {
    expect(await focusAfterRemoving(['Claude', 'Expo'], 'Expo')).toEqual(['Retirer Claude'])
  })

  it('moves the focus to the search field after the only chip', async () => {
    expect(await focusAfterRemoving(['Claude'], 'Claude')).toEqual([LABEL])
  })
})
