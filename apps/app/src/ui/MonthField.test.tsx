// Tests du champ « Commencé en » (R6a, « Commencé en » et « Facile à refaire ? ») : un mois et une
// année, facultatif ; pas après le mois en cours, pas avant janvier 2000 (bornes `min` et `max`,
// écrites « AAAA-MM » comme la valeur) ; « Effacer » le vide.
//
// Pour les lecteurs d'écran et le clavier (relecture du plan, ui-I7) : l'année est une valeur
// réglable, ses bornes lues ; les mois forment un groupe de douze choix (un seul arrêt de Tab,
// les flèches pour changer, comme `Choices`), inactifs après le mois de `max` dans l'année de `max`.
//
// L'interface attendue de `src/ui/MonthField.tsx` (plan R6a, découpage, ligne U2) :
// `MonthField({ label; value: string | null; onChange(value: string | null); min; max;
// monthNames: string[]; clearLabel; error? })`. Les noms des mois viennent de l'écran (ici écrits à
// la main : des données de test).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { lendWebPage } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MonthField } from './MonthField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const monthNames = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
const label = fr.t(($) => $.project.form.startedOn)
const clearLabel = fr.t(($) => $.project.form.clear)
// Le dernier mois permis : novembre 2026 (le « mois en cours » des tests) ; le premier : janvier 2000.
const MIN = '2000-01'
const MAX = '2026-11'

/** Le champ, qui garde sa valeur comme dans le formulaire ; `onChange` voit chaque changement. */
const Sample = ({
  start = null,
  onChange,
}: {
  start?: string | null
  onChange?: (value: string | null) => void
}) => {
  const [value, setValue] = useState<string | null>(start)
  return (
    <MonthField
      label={label}
      value={value}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
      min={MIN}
      max={MAX}
      monthNames={monthNames}
      clearLabel={clearLabel}
    />
  )
}

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** L'année : le seul élément réglable du champ. */
const year = () => {
  const found = [
    ...screen.queryAllByRole('adjustable'),
    ...screen.queryAllByRole('slider'),
  ] as unknown as { props: Record<string, unknown> }[]
  expect(found).toHaveLength(1)
  return found[0] as { props: Record<string, unknown> }
}

/** La valeur lue de l'année et ses bornes : `accessibilityValue`, ou `aria-value*` (web). */
const yearValue = () => {
  const { props } = year()
  const native = props.accessibilityValue as
    | { min?: number; max?: number; now?: number }
    | undefined
  return {
    min: Number(native?.min ?? props['aria-valuemin']),
    max: Number(native?.max ?? props['aria-valuemax']),
    now: Number(native?.now ?? props['aria-valuenow']),
  }
}

const adjust = (actionName: 'increment' | 'decrement') =>
  fireEvent(year() as never, 'accessibilityAction', { nativeEvent: { actionName } })

const month = (index: number) => screen.getByRole('radio', { name: monthNames[index] })

describe('MonthField', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows its label and twelve months, none checked when empty', async () => {
    await renderWithProviders(<Sample />)

    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(12)
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('reads the year as an adjustable value with its bounds', async () => {
    await renderWithProviders(<Sample start="2025-03" />)

    expect(['adjustable', 'slider']).toContain(roleOf(year().props))
    expect(yearValue()).toEqual({ min: 2000, max: 2026, now: 2025 })
    const actions = (year().props.accessibilityActions ?? []) as { name: string }[]
    expect(actions.map((action) => action.name)).toEqual(
      expect.arrayContaining(['increment', 'decrement']),
    )
    expect(screen.getByRole('radio', { name: 'mars', checked: true })).toBeTruthy()
  })

  it('changes the year, and never beyond its bounds', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample start="2025-03" onChange={onChange} />)

    await adjust('increment')
    expect(onChange).toHaveBeenLastCalledWith('2026-03')
    expect(yearValue().now).toBe(2026)

    // 2026 est la dernière année : rien ne change.
    onChange.mockClear()
    await adjust('increment')
    expect(onChange).not.toHaveBeenCalled()
    expect(yearValue().now).toBe(2026)
  })

  it('never goes before January 2000', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample start="2000-06" onChange={onChange} />)

    await adjust('decrement')

    expect(onChange).not.toHaveBeenCalled()
    expect(yearValue().now).toBe(2000)
  })

  it('lets the months be chosen with the arrow keys, one tab stop (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })
    const onChange = jest.fn()
    await renderWithProviders(<Sample start="2025-03" onChange={onChange} />)

    // Un seul arrêt de Tab pour les douze mois : celui qui est coché.
    const tabIndexes = () =>
      screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)
    expect(tabIndexes().filter((index) => index === 0)).toHaveLength(1)
    expect(month(2).props.tabIndex).toBe(0)

    await fireEvent(month(2), 'keyDown', key('ArrowRight'))
    expect(onChange).toHaveBeenLastCalledWith('2025-04')
    expect(screen.getByRole('radio', { name: 'avril', checked: true })).toBeTruthy()

    await fireEvent(month(3), 'keyDown', key('ArrowLeft'))
    expect(onChange).toHaveBeenLastCalledWith('2025-03')
    expect(tabIndexes().filter((index) => index === 0)).toHaveLength(1)
  })

  it('disables the months after the current month of the last year', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample start="2026-03" onChange={onChange} />)

    expect(month(10)).toBeEnabled() // novembre 2026 : le mois en cours
    expect(month(11)).toBeDisabled() // décembre 2026 : pas encore
    await fireEvent.press(month(11))
    expect(onChange).not.toHaveBeenCalled()

    // Une autre année : les douze mois sont permis.
    await adjust('decrement')
    expect(month(11)).toBeEnabled()
  })

  it('brings the month back to the latest allowed when the year changes', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample start="2025-12" onChange={onChange} />)

    await adjust('increment')

    // Décembre 2026 n'existe pas encore : novembre, le dernier mois permis.
    expect(onChange).toHaveBeenLastCalledWith('2026-11')
    expect(screen.getByRole('radio', { name: 'novembre', checked: true })).toBeTruthy()
  })

  it('takes the year of max when a month is chosen first', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample onChange={onChange} />)

    await fireEvent.press(month(2))

    expect(onChange).toHaveBeenLastCalledWith('2026-03')
    expect(yearValue().now).toBe(2026)
  })

  it('clears the value and gives the focus to the field', async () => {
    // Le focus se voit sur le web : on écoute `focus` sur les vues natives (toutes partagent le
    // prototype de la vue témoin), comme `testing/arrivedFocus.tsx`, qui prête aussi la page web.
    const restorePage = lendWebPage()
    const probe = createRef<View>()
    const onChange = jest.fn()
    await renderWithProviders(
      <>
        <View ref={probe} />
        <Sample start="2025-03" onChange={onChange} />
      </>,
    )
    const proto = Object.getPrototypeOf(probe.current) as { focus?: () => void }
    const hadFocus = Object.hasOwn(proto, 'focus')
    const originalFocus = proto.focus
    if (typeof proto.focus !== 'function') proto.focus = () => {}
    const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
    try {
      await fireEvent.press(screen.getByRole('button', { name: clearLabel }))

      expect(onChange).toHaveBeenLastCalledWith(null)
      expect(screen.queryByRole('radio', { checked: true })).toBeNull()
      // Le focus ne retombe pas sur la page : il va au champ, l'année ou un mois (jamais
      // « Effacer », qui n'a plus rien à effacer).
      const focused = focus.mock.contexts.map(
        (node) => (node as { props?: Record<string, unknown> } | null)?.props ?? {},
      )
      expect(
        focused.some((props) =>
          ['adjustable', 'slider', 'radio', 'radiogroup', 'group'].includes(String(roleOf(props))),
        ),
      ).toBe(true)
    } finally {
      focus.mockRestore()
      if (hadFocus) proto.focus = originalFocus
      else delete proto.focus
      restorePage()
    }
  })

  it('shows its error', async () => {
    await renderWithProviders(
      <MonthField
        label={label}
        value={null}
        onChange={() => {}}
        min={MIN}
        max={MAX}
        monthNames={monthNames}
        clearLabel={clearLabel}
        error="Ce mois n’est pas encore arrivé."
      />,
    )

    expect(screen.getByText('Ce mois n’est pas encore arrivé.')).toBeTruthy()
  })
})
