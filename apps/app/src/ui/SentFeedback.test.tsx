// Tests de la carte d'un projet et de ses messages dans « Mes retours envoyés » (R11, `SentFeedback`) :
// par rôle, nom et état, jamais par le style.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders as render } from '../testing/render'
import { SentFeedbackGroup, SentFeedbackMessage } from './SentFeedback'

const onDelete = jest.fn()
const onOpen = jest.fn()

const message = (over: Partial<Parameters<typeof SentFeedbackMessage>[0]> = {}) => (
  <SentFeedbackMessage
    outcome={{ value: 'partly', label: 'En partie', spokenLabel: 'Ça a marché : En partie' }}
    at="2026-11-14T18:00:00.000Z"
    now={new Date('2026-11-15T12:00:00.000Z')}
    text="La voix se coupe."
    capture={null}
    deleteLabel="Supprimer"
    deleteSpokenLabel="Supprimer le message : La voix se coupe."
    onDelete={onDelete}
    {...over}
  />
)

beforeEach(() => {
  onDelete.mockReset()
  onOpen.mockReset()
})

describe('SentFeedbackGroup', () => {
  it('titles the card with the project, a level-2 heading, and names the corner it opens', async () => {
    await render(
      <SentFeedbackGroup
        title="Le jardin qui parle"
        subtitle="Papi Jean"
        open={{
          label: 'Ouvrir le coin',
          spokenLabel: 'Ouvrir le coin des testeurs de Le jardin qui parle',
          onPress: onOpen,
        }}
      >
        {message()}
      </SentFeedbackGroup>,
    )

    expect(screen.getByRole('header', { name: 'Le jardin qui parle' })).toBeTruthy()
    expect(screen.getByText('Papi Jean')).toBeTruthy()
    const link = screen.getByRole('link', {
      name: 'Ouvrir le coin des testeurs de Le jardin qui parle',
    })
    await fireEvent.press(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('says a closed corner, and who sees what, with no way in', async () => {
    await render(
      <SentFeedbackGroup
        title="Mes recettes"
        subtitle="Hugo"
        closed={{ label: 'Coin fermé', note: 'Seuls tes messages restent ici.' }}
      >
        {message()}
      </SentFeedbackGroup>,
    )

    expect(screen.getByText('Coin fermé')).toBeTruthy()
    expect(screen.getByText('Seuls tes messages restent ici.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('names nobody for a project no longer visible', async () => {
    await render(
      <SentFeedbackGroup title="Projet qui n’est plus visible" gone>
        {message()}
      </SentFeedbackGroup>,
    )

    expect(screen.getByRole('header', { name: 'Projet qui n’est plus visible' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Coin fermé')).toBeNull()
  })
})

describe('SentFeedbackMessage', () => {
  it('reads the outcome by its sentence, shows the text, and deletes by a button named by its excerpt', async () => {
    await render(message())

    expect(screen.getByLabelText('Ça a marché : En partie')).toBeTruthy()
    expect(screen.getByText('La voix se coupe.')).toBeTruthy()
    await fireEvent.press(
      screen.getByRole('button', { name: 'Supprimer le message : La voix se coupe.' }),
    )
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('names the capture by the fixed sentence it is given', async () => {
    await render(
      message({
        capture: {
          source: { uri: 'https://example.test/capture.webp' },
          width: 390,
          height: 844,
          description: 'Capture d’écran jointe à ton retour',
        },
      }),
    )

    expect(screen.getAllByLabelText('Capture d’écran jointe à ton retour').length).toBeGreaterThan(
      0,
    )
  })

  it('shows its note when the moderation removed it, and nothing otherwise', async () => {
    const view = await render(message({ note: 'Retiré par la modération' }))
    expect(screen.getByText('Retiré par la modération')).toBeTruthy()
    await view.unmount()

    await render(message({ outcome: null }))
    expect(screen.queryByText('Retiré par la modération')).toBeNull()
    expect(screen.queryByLabelText('Ça a marché : En partie')).toBeNull()
  })
})
