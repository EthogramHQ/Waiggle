// Tests des réactions d'un projet public vues par un visiteur (tranche R12, `ui/ReactionSummary`) :
// le nombre seul, « de membres », jamais qui ni quelles réactions ; « Réagir » appelle la page, qui
// ouvre la feuille « Compte requis ».
import { fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ReactionSummary } from './ReactionSummary'

const en = createI18n('en')

const onReact = jest.fn()
beforeEach(() => onReact.mockClear())

describe('ReactionSummary (R12)', () => {
  it('says how many members reacted, in a sentence', async () => {
    await renderWithProviders(<ReactionSummary count={54} onReact={onReact} />)

    expect(screen.getByText(fr.t(($) => $.visitor.reactions, { count: 54 }))).toBeTruthy()
  })

  it('says a single reaction in the singular', async () => {
    await renderWithProviders(<ReactionSummary count={1} onReact={onReact} />)

    expect(screen.getByText(fr.t(($) => $.visitor.reactions, { count: 1 }))).toBeTruthy()
    expect(fr.t(($) => $.visitor.reactions, { count: 1 })).not.toMatch(/réactions/)
  })

  it('never names a kind of reaction', async () => {
    await renderWithProviders(<ReactionSummary count={54} onReact={onReact} />)

    // Témoin : la phrase est là.
    expect(screen.getByText(fr.t(($) => $.visitor.reactions, { count: 54 }))).toBeTruthy()
    for (const kind of ['bravo', 'amazing', 'inspiring', 'useful', 'funny'] as const) {
      expect(screen.queryByText(fr.t(($) => $.project.reactions[kind]))).toBeNull()
    }
  })

  it('offers « Réagir », a button that asks the page, once per tap', async () => {
    await renderWithProviders(<ReactionSummary count={54} onReact={onReact} />)

    const react = screen.getByRole('button', { name: fr.t(($) => $.visitor.react) })
    expect(react).not.toBeDisabled()
    await fireEvent.press(react)

    expect(onReact).toHaveBeenCalledTimes(1)
  })

  it('speaks English', async () => {
    await renderWithProviders(<ReactionSummary count={3} onReact={onReact} />, 'en')

    expect(screen.getByText(en.t(($) => $.visitor.reactions, { count: 3 }))).toBeTruthy()
    expect(screen.getByRole('button', { name: en.t(($) => $.visitor.react) })).toBeTruthy()
  })
})
