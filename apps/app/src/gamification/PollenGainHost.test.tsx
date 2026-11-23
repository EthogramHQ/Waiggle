// Tests de l'hôte global de la pastille de gain (R19) : les gestes sans place à eux (suivre, une
// ruche, une invitation, publier, une mise à jour, le profil) montrent « +N pollen » à la place du
// toast, en bas de l'écran. Un seul à la fois ; si un toast est affiché, la pastille attend sa fin
// pour ne pas se poser sur lui.
import { act, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider, useToast } from '../ui/theme/toast'
import { PollenGainHost } from './PollenGainHost'
import { reportPollen, resetPollen, usePollenGain } from './pollen'

beforeEach(() => {
  jest.useFakeTimers()
  resetPollen()
})
afterEach(() => {
  resetPollen()
  jest.useRealTimers()
})

const pastilles = (amount: number) =>
  screen.queryAllByText(
    fr.t(($) => $.game.gain, { amount }),
    { includeHiddenElements: true },
  )

/** Un écran qui affiche un toast dès son arrivée, comme « Projet publié ». */
function ToastOnMount() {
  const toast = useToast()
  useEffect(() => toast.show('Projet publié.'), [toast])
  return null
}

/** Un porteur de l'ancrage « réaction » : les gains de cet ancrage ne vont pas à l'hôte. */
function ReactionHolder() {
  usePollenGain('reaction')
  return null
}

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

describe('PollenGainHost', () => {
  it('shows a global gain at the place of the toast', async () => {
    await renderWithProviders(
      <ToastProvider>
        <PollenGainHost />
      </ToastProvider>,
    )
    expect(pastilles(3)).toHaveLength(0)
    await act(async () => reportPollen(3, 'global'))
    await wait(400)
    expect(pastilles(3)).toHaveLength(1)
  })

  it('leaves the gains of a gesture with its own place to that place', async () => {
    await renderWithProviders(
      <ToastProvider>
        <PollenGainHost />
        <ReactionHolder />
      </ToastProvider>,
    )
    await act(async () => reportPollen(2, 'reaction', 'useful'))
    await wait(400)
    expect(pastilles(2)).toHaveLength(0)
  })

  it('waits for the toast to leave before showing the badge', async () => {
    await renderWithProviders(
      <ToastProvider>
        <PollenGainHost />
        <ToastOnMount />
      </ToastProvider>,
    )
    expect(screen.getByText('Projet publié.')).toBeOnTheScreen()
    await act(async () => reportPollen(5, 'global'))
    await wait(400)
    // Le toast est encore là : la pastille attend.
    expect(pastilles(5)).toHaveLength(0)
    // Le toast part (2,4 s de lecture, puis son fondu) : la pastille se montre ensuite, même si le
    // gain n'est plus « le dernier » du magasin (2,5 s).
    await wait(3000)
    expect(screen.queryByText('Projet publié.')).toBeNull()
    await wait(400)
    expect(pastilles(5)).toHaveLength(1)
  })

  it('shows one badge at a time: a new gain replaces the one before', async () => {
    await renderWithProviders(
      <ToastProvider>
        <PollenGainHost />
      </ToastProvider>,
    )
    await act(async () => reportPollen(3, 'global'))
    await wait(400)
    await act(async () => reportPollen(4, 'global'))
    await wait(400)
    expect(pastilles(3)).toHaveLength(0)
    expect(pastilles(4)).toHaveLength(1)
  })

  it('takes the badge away once it has played', async () => {
    await renderWithProviders(
      <ToastProvider>
        <PollenGainHost />
      </ToastProvider>,
    )
    await act(async () => reportPollen(3, 'global'))
    await wait(400)
    expect(pastilles(3)).toHaveLength(1)
    await wait(4000)
    expect(pastilles(3)).toHaveLength(0)
  })
})
