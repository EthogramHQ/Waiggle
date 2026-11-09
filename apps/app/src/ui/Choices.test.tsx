// Tests de Choices ajoutés après la tranche 7c (les premiers sont dans components.test.tsx). Un
// fichier par composant pour ce qui s'ajoute (décision du 25/10/2026).
import { fireEvent, screen, within } from '@testing-library/react-native'
import { createRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Choices } from './Choices'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Choices', () => {
  // Relecture de design 7c : à 320 px et texte à 200 %, la pastille « Les règles de Waiggle »
  // sortait de l'écran (343 px). Sur le web, react-native-web donne `flexShrink: 0` à toute vue :
  // une pastille ne se replie dans sa rangée qu'avec `maxWidth: '100%'` et `flexShrink: 1` (PR #29).
  // On teste la règle (« elle peut rétrécir »), pas une valeur de design.
  it('lets a long choice shrink within its row instead of overflowing it', async () => {
    await renderWithProviders(
      <Choices
        label="Fondement"
        options={[
          { value: 'illegal', label: 'Un contenu illégal' },
          { value: 'rules', label: 'Les règles du réseau, au sens le plus large' },
        ]}
        value={null}
        onChange={jest.fn()}
      />,
    )

    const style = StyleSheet.flatten(
      screen.getByRole('radio', { name: 'Les règles du réseau, au sens le plus large' }).props
        .style,
    )
    expect(style.maxWidth).toBe('100%')
    expect(style.flexShrink).toBe(1)
  })

  // R6b (ui-C2) : une réponse qui manque (« Choisis une famille. ») s'écrit sous les choix, et le
  // groupe se déclare invalide (web) en citant la phrase ; sans erreur, ni phrase ni état.
  it('shows its error under the choices and marks the group invalid on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const message = fr.t(($) => $.moderation.catalogue.familyRequired)
      await renderWithProviders(
        <Choices
          label="Famille"
          options={[{ value: 'a', label: 'Assistant' }]}
          value={null}
          onChange={jest.fn()}
          error={message}
        />,
      )
      expect(screen.getByText(message)).toBeTruthy()
      const group = screen.getByLabelText('Famille', { exact: true })
      expect(group.props['aria-invalid']).toBe(true)
      expect(group.props['aria-describedby']).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('has no error text and no invalid state without an error', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <Choices
          label="Famille"
          options={[{ value: 'a', label: 'Assistant' }]}
          value={null}
          onChange={jest.fn()}
        />,
      )
      expect(screen.queryByText(fr.t(($) => $.moderation.catalogue.familyRequired))).toBeNull()
      expect(
        screen.getByLabelText('Famille', { exact: true }).props['aria-invalid'],
      ).toBeUndefined()
    } finally {
      jest.restoreAllMocks()
    }
  })
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

// R6a, « Facile à refaire ? » (scénario, F-Pr14, F-Mod5 ; relecture du plan ui-B5 et ui-I8) : trois
// pastilles facultatives, chacune avec un rond de couleur (`dot`, un rôle de couleur de la marque :
// vert, jaune, rouge). La couleur n'est jamais seule : le texte dit tout, et le rond ne change pas
// le nom lu. « Effacer » (`clearLabel`) vide la réponse : `onChange(null)`, puis le focus revient au
// groupe (son seul arrêt de Tab), au lieu de tomber sur la page quand le bouton disparaît ou
// s'éteint.
describe('Choices with dots and a clear button (R6a)', () => {
  const LABEL = fr.t(($) => $.project.form.difficulty)
  const CLEAR = fr.t(($) => $.project.form.clear)
  const easy = fr.t(($) => $.project.difficulty.easy)
  const medium = fr.t(($) => $.project.difficulty.medium)
  const hard = fr.t(($) => $.project.difficulty.hard)
  type Difficulty = 'easy' | 'medium' | 'hard'
  const dotted = [
    { value: 'easy', label: easy, dot: 'success' },
    { value: 'medium', label: medium, dot: 'amber' },
    { value: 'hard', label: hard, dot: 'danger' },
  ] as const

  /** La question, avec sa réponse gardée comme dans le formulaire ; `onChange` voit chaque valeur. */
  function DifficultyChoices({
    start = null,
    onChange,
    clear = true,
  }: {
    start?: Difficulty | null
    onChange?: (value: Difficulty | null) => void
    clear?: boolean
  }) {
    const [value, setValue] = useState<Difficulty | null>(start)
    return (
      <Choices
        label={LABEL}
        options={[...dotted]}
        value={value}
        onChange={(next) => {
          onChange?.(next)
          setValue(next)
        }}
        {...(clear ? { clearLabel: CLEAR } : null)}
      />
    )
  }

  /** Le nombre d'éléments dessinés dans un choix, lui compris. */
  const drawnInside = (node: Host): number =>
    1 +
    node.children.reduce(
      (sum, child) => sum + (typeof child === 'string' ? 0 : drawnInside(child)),
      0,
    )

  it('names each choice by its text alone, the dot never carrying the meaning', async () => {
    await renderWithProviders(<DifficultyChoices />)

    for (const label of [easy, medium, hard]) {
      const radio = screen.getByRole('radio', { name: label })
      // Le nom est le texte, mot pour mot : ni « vert », ni « rouge ».
      expect(radio.props.accessibilityLabel).toBe(label)
      expect(within(radio).getByText(label)).toBeTruthy()
    }
  })

  it('draws a dot only for the options that have one', async () => {
    await renderWithProviders(
      <Choices
        label={LABEL}
        options={[
          { value: 'easy', label: 'Facile', dot: 'success' },
          { value: 'hard', label: 'Ardue' },
        ]}
        value={null}
        onChange={() => {}}
      />,
    )

    const withDot = screen.getByRole('radio', { name: 'Facile' }) as unknown as Host
    const without = screen.getByRole('radio', { name: 'Ardue' }) as unknown as Host
    expect(drawnInside(withDot)).toBeGreaterThan(drawnInside(without))
  })

  it('clears the answer with « Effacer », calling onChange(null)', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<DifficultyChoices start="medium" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: medium, checked: true })).toBeTruthy() // témoin

    await fireEvent.press(screen.getByRole('button', { name: CLEAR }))

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('offers nothing to clear when no choice is checked', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<DifficultyChoices onChange={onChange} />)

    expect(screen.getAllByRole('radio')).toHaveLength(3) // témoin
    // « Effacer » est absent, ou présent mais inactif : dans les deux cas, rien ne part.
    const clear = screen.queryByRole('button', { name: CLEAR })
    if (clear) {
      await fireEvent.press(clear)
      expect(onChange).not.toHaveBeenCalled()
    }
  })

  it('shows no « Effacer » without clearLabel, as before R6a', async () => {
    await renderWithProviders(<DifficultyChoices start="easy" clear={false} />)

    expect(screen.getByRole('radio', { name: easy, checked: true })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: CLEAR })).toBeNull()
  })

  it('gives the focus back to the group once cleared (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const probe = createRef<View>()
    await renderWithProviders(
      <>
        <View ref={probe} />
        <DifficultyChoices start="hard" />
      </>,
    )
    // On écoute `focus` sur le prototype des vues natives (une vue témoin le donne).
    const proto = Object.getPrototypeOf(probe.current) as { focus?: unknown }
    const hadFocus = Object.hasOwn(proto, 'focus')
    const original = proto.focus
    if (typeof proto.focus !== 'function') proto.focus = () => {}
    const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
    focus.mockClear()
    try {
      await fireEvent.press(screen.getByRole('button', { name: CLEAR }))

      // Rien n'est coché : le seul arrêt de Tab du groupe est son premier choix.
      expect(focus.mock.contexts.map(labelOf)).toEqual([easy])
    } finally {
      focus.mockRestore()
      if (hadFocus) proto.focus = original
      else delete proto.focus
      jest.restoreAllMocks()
    }
  })
})

// R6a, correction C9 (S1 de la contre-visite du design) : une fenêtre à champs obligatoires (le
// retrait de la modération) s'ouvre sur son premier champ, le groupe « Fondement ». `entryRef`
// désigne le seul arrêt de Tab du groupe : le choix coché, sinon le premier.
describe('Choices, the entry of the group (R6a, C9)', () => {
  const options = [
    { value: 'illegal', label: 'La loi' },
    { value: 'rules', label: 'Les règles' },
  ] as const

  it('points entryRef at the first choice when none is checked', async () => {
    const entry = createRef<View>()
    await renderWithProviders(
      <Choices
        label="Fondement"
        options={[...options]}
        value={null}
        onChange={jest.fn()}
        entryRef={entry}
      />,
    )

    expect(labelOf(entry.current)).toBe('La loi')
  })

  it('points entryRef at the checked choice', async () => {
    const entry = createRef<View>()
    await renderWithProviders(
      <Choices
        label="Fondement"
        options={[...options]}
        value="rules"
        onChange={jest.fn()}
        entryRef={entry}
      />,
    )

    expect(labelOf(entry.current)).toBe('Les règles')
  })
})
