// Tests de la liste « Ce qui a changé » de la feuille « Nouvelle mise à jour » (R7a, scénario
// « Publier une mise à jour », relecture du plan, interface A1). De 1 à 5 lignes, chacune avec sa
// famille (« Nouveau », « Réparé », « Plus joli ») et son texte ; un compteur « 2 / 5 », lu « 2 lignes
// sur 5 » ; « Ajouter une ligne » jusqu'à la cinquième ; « Retirer cette ligne » tant qu'il en reste
// plus d'une ; une aide sous la liste. Le focus n'est jamais perdu : il va à la ligne ajoutée, ou, au
// retrait, à la ligne d'avant (sinon à la suivante).
//
// L'API fixée au lancement (`src/ui/UpdateLinesField.tsx`, U1c) :
// `UpdateLinesField({ lines: UpdateLineValue[], onAdd, onRemove(id), onFamilyChange(id, family),
// onTextChange(id, text), error?: string | null, editable?: boolean })`, avec
// `UpdateLineValue = { id, family, text }` exporté par le composant. L'`id` est stable (jamais le
// rang), fabriqué par le parent (`updates/form.ts`). `error` se pose sur la première ligne
// (`aria-invalid`) et chaque nouvelle valeur non nulle lui donne le focus ; `editable={false}`
// pendant l'envoi.
import type { UpdateFamily } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, TextInput } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { UpdateLinesField, type UpdateLineValue } from './UpdateLinesField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const family = (key: UpdateFamily) => fr.t(($) => $.update.family[key])
/** Le nom lu d'une ligne : « Changement 2 sur 3, Réparé ». */
const lineName = (number: number, total: number, key: UpdateFamily) =>
  fr.t(($) => $.project.updates.lineLabel, { number, total, family: family(key) })
const removeName = (number: number) => fr.t(($) => $.project.updates.removeLineLabel, { number })
const ADD = fr.t(($) => $.project.updates.addLine)
const HINT = fr.t(($) => $.project.updates.linesHint)
const REQUIRED = fr.t(($) => $.project.updates.required)

/** Une ligne, son id stable fabriqué par le parent. */
const line = (id: string, key: UpdateFamily, text = ''): UpdateLineValue => ({
  id,
  family: key,
  text,
})

/** Les trois lignes de la fusée : un ajout, une réparation, une retouche. */
const rocketLines = [
  line('a', 'new', 'Un compte à rebours avant chaque question'),
  line('b', 'fixed', 'Le score ne repart plus à zéro au niveau 3'),
  line('c', 'polish', 'Des étoiles qui scintillent'),
]

/**
 * La liste tenue par un parent, comme la feuille le fera (`updates/form.ts`) : il fabrique les ids
 * (`n1`, `n2`…), ajoute, retire et change les lignes ; le test lit les appels reçus.
 */
function Lines({
  start,
  error = null,
  editable,
  spy,
}: {
  start: UpdateLineValue[]
  error?: string | null
  editable?: boolean
  spy?: { onFamilyChange?: jest.Mock; onTextChange?: jest.Mock; onRemove?: jest.Mock }
}) {
  const [lines, setLines] = useState(start)
  const [next, setNext] = useState(1)
  return (
    <UpdateLinesField
      lines={lines}
      error={error}
      {...(editable !== undefined ? { editable } : null)}
      onAdd={() => {
        setLines((current) => [...current, line(`n${next}`, 'new')])
        setNext((n) => n + 1)
      }}
      onRemove={(id) => {
        spy?.onRemove?.(id)
        setLines((current) => current.filter((one) => one.id !== id))
      }}
      onFamilyChange={(id, key) => {
        spy?.onFamilyChange?.(id, key)
        setLines((current) => current.map((one) => (one.id === id ? { ...one, family: key } : one)))
      }}
      onTextChange={(id, text) => {
        spy?.onTextChange?.(id, text)
        setLines((current) => current.map((one) => (one.id === id ? { ...one, text } : one)))
      }}
    />
  )
}

/** Le focus du clavier, écouté sur les champs : le nom de chaque champ qui l'a reçu. */
const watchFocus = () => {
  const focus = jest.spyOn(TextInput.prototype, 'focus')
  return () => focus.mock.contexts.map((field) => labelOf(field))
}

/** Ce qui se lit sous ce nom : un élément nommé ainsi, ou un texte (masqué) qui le dit. */
const readAs = (name: string) =>
  screen.queryByLabelText(name) ?? screen.queryByText(name, { includeHiddenElements: true })

afterEach(() => jest.restoreAllMocks())

describe('UpdateLinesField, its lines (R7a)', () => {
  it('names each line field with its rank and family', async () => {
    await renderWithProviders(<Lines start={rocketLines} />)

    expect(screen.getByLabelText(lineName(1, 3, 'new'))).toBeTruthy()
    expect(screen.getByLabelText('Changement 2 sur 3, Réparé')).toBeTruthy()
    expect(screen.getByLabelText(lineName(3, 3, 'polish'))).toBeTruthy()
  })

  it('names each remove button with its rank', async () => {
    await renderWithProviders(<Lines start={rocketLines} />)

    expect(screen.getByRole('button', { name: 'Retirer la ligne 2' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Retirer la ligne/ })).toHaveLength(3)
  })

  it('passes what is typed to the parent, with the id of its line', async () => {
    const onTextChange = jest.fn()
    await renderWithProviders(<Lines start={rocketLines} spy={{ onTextChange }} />)

    await fireEvent.changeText(screen.getByLabelText(lineName(2, 3, 'fixed')), 'Le score tient')

    expect(onTextChange).toHaveBeenCalledWith('b', 'Le score tient')
  })

  it('removes a line by its id, never by its rank', async () => {
    const onRemove = jest.fn()
    await renderWithProviders(<Lines start={rocketLines} spy={{ onRemove }} />)

    await fireEvent.press(screen.getByRole('button', { name: removeName(2) }))

    expect(onRemove).toHaveBeenCalledWith('b')
  })

  it('keeps the other lines and their families when a middle line is removed', async () => {
    await renderWithProviders(<Lines start={rocketLines} />)

    await fireEvent.press(screen.getByRole('button', { name: removeName(2) }))

    const first = screen.getByLabelText(lineName(1, 2, 'new'))
    const second = screen.getByLabelText(lineName(2, 2, 'polish'))
    expect(first.props.value).toBe('Un compte à rebours avant chaque question')
    expect(second.props.value).toBe('Des étoiles qui scintillent')
    expect(screen.queryByDisplayValue('Le score ne repart plus à zéro au niveau 3')).toBeNull()
  })

  it('offers no « Retirer » when a single line is left', async () => {
    await renderWithProviders(<Lines start={[line('a', 'new', 'Un mode nuit')]} />)

    // Témoin : la ligne est là.
    expect(screen.getByLabelText(lineName(1, 1, 'new'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Retirer la ligne/ })).toBeNull()
  })

  it('offers « Ajouter une ligne » up to five lines, never after', async () => {
    await renderWithProviders(<Lines start={rocketLines.slice(0, 1)} />)

    for (let count = 1; count < 5; count += 1) {
      await fireEvent.press(screen.getByRole('button', { name: ADD }))
    }

    expect(screen.getByLabelText(lineName(5, 5, 'new'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: ADD })).toBeNull()
  })

  it('shows the counter « 2 / 5 »', async () => {
    await renderWithProviders(<Lines start={rocketLines.slice(0, 2)} />)

    expect(
      screen.getByText(
        fr.t(($) => $.project.updates.counter, { count: 2, max: 5 }),
        {
          includeHiddenElements: true,
        },
      ),
    ).toBeTruthy()
  })

  it('reads the counter as « 2 lignes sur 5 »', async () => {
    await renderWithProviders(<Lines start={rocketLines.slice(0, 2)} />)

    expect(readAs('2 lignes sur 5')).not.toBeNull()
    expect(fr.t(($) => $.project.updates.counterLabel, { count: 1, max: 5 })).toBe('1 ligne sur 5')
  })

  it('shows its hint under the list', async () => {
    await renderWithProviders(<Lines start={rocketLines.slice(0, 1)} />)

    expect(screen.getByText(HINT)).toBeTruthy()
  })

  it('makes every line read-only while sending', async () => {
    await renderWithProviders(<Lines start={rocketLines} editable={false} />)

    for (const [index, key] of (['new', 'fixed', 'polish'] as const).entries()) {
      expect(screen.getByLabelText(lineName(index + 1, 3, key)).props.editable).toBe(false)
    }
  })
})

describe('UpdateLinesField, where the focus goes (R7a)', () => {
  it('moves focus to the new line after « Ajouter une ligne »', async () => {
    await renderWithProviders(<Lines start={rocketLines.slice(0, 1)} />)
    const focused = watchFocus()

    await fireEvent.press(screen.getByRole('button', { name: ADD }))

    expect(focused().at(-1)).toBe(lineName(2, 2, 'new'))
  })

  it('moves focus to the previous line when a line is removed', async () => {
    await renderWithProviders(<Lines start={rocketLines} />)
    const focused = watchFocus()

    await fireEvent.press(screen.getByRole('button', { name: removeName(2) }))

    expect(focused().at(-1)).toBe(lineName(1, 2, 'new'))
  })

  it('moves focus to the next line when the first line is removed', async () => {
    await renderWithProviders(<Lines start={rocketLines} />)
    const focused = watchFocus()

    await fireEvent.press(screen.getByRole('button', { name: removeName(1) }))

    // L'ancienne ligne 2 (« Réparé ») est devenue la première.
    expect(focused().at(-1)).toBe(lineName(1, 2, 'fixed'))
  })

  it('marks the first line invalid and focuses it when publishing with no line written', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const empty = [line('a', 'new'), line('b', 'fixed')]
    const { rerender } = await renderWithProviders(<Lines start={empty} />)
    const focused = watchFocus()

    await rerender(<Lines start={empty} error={REQUIRED} />)

    const first = screen.getByLabelText(lineName(1, 2, 'new'))
    expect(first.props['aria-invalid']).toBe(true)
    expect(screen.getByLabelText(lineName(2, 2, 'fixed')).props['aria-invalid']).not.toBe(true)
    expect(screen.getAllByText(REQUIRED, { includeHiddenElements: true }).length).toBeGreaterThan(0)
    expect(focused().at(-1)).toBe(lineName(1, 2, 'new'))
  })

  it('focuses the first line again at each new refusal', async () => {
    const empty = [line('a', 'new'), line('b', 'fixed')]
    const { rerender } = await renderWithProviders(<Lines start={empty} error={REQUIRED} />)
    const focused = watchFocus()

    // « Publier » touché de nouveau : l'erreur est effacée, puis reposée.
    await rerender(<Lines start={empty} error={null} />)
    await rerender(<Lines start={empty} error={REQUIRED} />)
    await act(async () => {})

    expect(focused().filter((name) => name === lineName(1, 2, 'new')).length).toBeGreaterThan(0)
  })
})
