// Tests du choix du défi perso (R19, `ChallengeChoice`, rubrique « Mon défi » de « Ma récolte ») :
// « Choisis ton défi », trois défis en boutons radio (`ListGroup radio`, relecture d'interface du
// plan UI-3 : un seul arrêt de Tab, les flèches), « Choisir ce défi » qui envoie une fois même sur
// deux tapes, et « Pas cette semaine ». Le composant ne lit aucune donnée : l'écran garde le choix
// (`value`) et envoie la requête (`onConfirm`, `onSkip`).
import type { PersonalChallengeCode } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ChallengeChoice } from './ChallengeChoice'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les codes du contrat : l'écran passe les trois proposés de la semaine.
type Code = PersonalChallengeCode

const label = (code: Code) => fr.t(($) => $.game.challenges.personal[code])
const options = (['feedback', 'update', 'comment_3'] as const).map((code) => ({
  code,
  label: label(code),
  honey: 10,
}))

const CHOOSE = fr.t(($) => $.game.harvest.challenge.chooseTitle)
const CONFIRM = fr.t(($) => $.game.harvest.challenge.confirm)
const SKIP = fr.t(($) => $.game.harvest.challenge.skip)
const PRICE = fr.t(($) => $.game.harvest.challenge.price, { amount: 10 })
const ERROR = fr.t(($) => $.game.harvest.challenge.error)

// Le nom lu d'un choix commence par son défi ; il peut dire ensuite son miel (« …, 10 miel ») :
// le test ne fixe que le début.
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const choice = (code: Code, checked?: boolean) =>
  screen.getByRole('radio', {
    name: new RegExp(`^${escapeRegExp(label(code))}`),
    ...(checked === undefined ? null : { checked }),
  })

type Handlers = {
  onChange?: (code: Code) => void
  onConfirm?: () => void
  onSkip?: () => void
  busy?: boolean
  error?: string
}

// Le choix tel qu'un écran le pose : l'écran garde le défi coché.
function Choice({
  start = null,
  onChange = () => {},
  onConfirm = () => {},
  onSkip = () => {},
  busy = false,
  error,
}: Handlers & { start?: Code | null }) {
  const [value, setValue] = useState<Code | null>(start)
  return (
    <ChallengeChoice
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      onConfirm={onConfirm}
      onSkip={onSkip}
      busy={busy}
      {...(error ? { error } : null)}
    />
  )
}

const press = (key: string) => ({ key, preventDefault: () => {} })
const tabIndexes = () =>
  screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)

describe('ChallengeChoice', () => {
  it('offers the three challenges as one radio group named « Choisis ton défi »', async () => {
    await renderWithProviders(<Choice />)

    expect(screen.getByText(CHOOSE)).toBeTruthy()
    expect(screen.getByLabelText(CHOOSE).props.accessibilityRole).toBe('radiogroup')
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(choice('feedback', false)).toBeTruthy()
    expect(choice('update', false)).toBeTruthy()
    expect(choice('comment_3', false)).toBeTruthy()
  })

  it('shows the honey of each challenge', async () => {
    await renderWithProviders(<Choice />)

    expect(screen.getAllByText(new RegExp(escapeRegExp(PRICE)))).toHaveLength(3)
  })

  it('checks the challenge that is touched', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Choice onChange={onChange} />)

    await fireEvent.press(choice('update'))

    expect(onChange).toHaveBeenCalledWith('update')
    expect(choice('update', true)).toBeTruthy()
  })

  describe('with the keyboard, on the web', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
    })
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('is a single Tab stop: the first challenge while none is checked', async () => {
      await renderWithProviders(<Choice />)

      expect(tabIndexes()).toEqual([0, -1, -1])
    })

    it('moves its single Tab stop to the checked challenge', async () => {
      await renderWithProviders(<Choice start="comment_3" />)

      expect(tabIndexes()).toEqual([-1, -1, 0])
    })

    it('checks the next challenge with the down arrow, going round after the last', async () => {
      const onChange = jest.fn()
      await renderWithProviders(<Choice start="update" onChange={onChange} />)

      await fireEvent(choice('update'), 'keyDown', press('ArrowDown'))
      expect(onChange).toHaveBeenLastCalledWith('comment_3')
      expect(choice('comment_3', true)).toBeTruthy()

      await fireEvent(choice('comment_3'), 'keyDown', press('ArrowDown'))
      expect(onChange).toHaveBeenLastCalledWith('feedback')
      expect(choice('feedback', true)).toBeTruthy()
    })

    it('checks the previous challenge with the up arrow', async () => {
      const onChange = jest.fn()
      await renderWithProviders(<Choice start="update" onChange={onChange} />)

      await fireEvent(choice('update'), 'keyDown', press('ArrowUp'))

      expect(onChange).toHaveBeenLastCalledWith('feedback')
      expect(choice('feedback', true)).toBeTruthy()
    })

    // UI-3 : sans défi coché, « Choisir ce défi » est inactif mais reste un arrêt de Tab, annoncé
    // « désactivé » (`focusableWhenDisabled`), pour qu'on entende pourquoi il ne répond pas.
    it('keeps « Choisir ce défi » reachable but inactive while no challenge is checked', async () => {
      const onConfirm = jest.fn()
      await renderWithProviders(<Choice onConfirm={onConfirm} />)

      const confirm = screen.getByRole('button', { name: CONFIRM })
      expect(confirm).toBeDisabled()
      expect(confirm.props.tabIndex).toBe(0)
      await fireEvent.press(confirm)
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  it('turns « Choisir ce défi » on once a challenge is checked', async () => {
    const onConfirm = jest.fn()
    await renderWithProviders(<Choice onConfirm={onConfirm} />)

    await fireEvent.press(choice('feedback'))
    const confirm = screen.getByRole('button', { name: CONFIRM })
    expect(confirm).not.toBeDisabled()
    await fireEvent.press(confirm)

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  // Un défi choisi ne change plus de la semaine : deux tapes ne doivent pas l'envoyer deux fois.
  describe('against a double tap', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('confirms once for two taps on « Choisir ce défi »', async () => {
      const onConfirm = jest.fn()
      await renderWithProviders(<Choice start="feedback" onConfirm={onConfirm} />)

      await fireEvent.press(screen.getByRole('button', { name: CONFIRM }))
      await fireEvent.press(screen.getByRole('button', { name: CONFIRM }))

      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('confirms again once the guard is over', async () => {
      const onConfirm = jest.fn()
      await renderWithProviders(<Choice start="feedback" onConfirm={onConfirm} />)

      await fireEvent.press(screen.getByRole('button', { name: CONFIRM }))
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent.press(screen.getByRole('button', { name: CONFIRM }))

      expect(onConfirm).toHaveBeenCalledTimes(2)
    })
  })

  it('announces « Choisir ce défi » busy while the choice is sent, and ignores a new tap', async () => {
    const onConfirm = jest.fn()
    await renderWithProviders(<Choice start="feedback" onConfirm={onConfirm} busy />)

    const confirm = screen.getByRole('button', { name: CONFIRM })
    expect(confirm.props['aria-busy']).toBe(true)
    await fireEvent.press(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('lets the member pass this week with « Pas cette semaine »', async () => {
    const onSkip = jest.fn()
    const onConfirm = jest.fn()
    await renderWithProviders(<Choice onSkip={onSkip} onConfirm={onConfirm} />)

    await fireEvent.press(screen.getByRole('button', { name: SKIP }))

    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows the error sent by the screen when the choice could not be saved', async () => {
    await renderWithProviders(<Choice start="feedback" error={ERROR} />)

    expect(screen.getByText(ERROR)).toBeTruthy()
  })

  it('shows no error while nothing failed', async () => {
    await renderWithProviders(<Choice start="feedback" />)

    expect(screen.getByRole('button', { name: CONFIRM })).toBeTruthy()
    expect(screen.queryByText(ERROR)).toBeNull()
  })
})
