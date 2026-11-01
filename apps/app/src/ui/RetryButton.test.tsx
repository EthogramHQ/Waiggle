// Tests du bouton « à réessayer plus tard » (RetryButton, R2, relecture C1 et jur-13) : bloqué, il
// est inactif et dit pourquoi, en reliant la phrase « Nouvel essai possible à… » (web) ou en la
// lisant en indice (téléphone) ; libre, il est un bouton ordinaire, sans phrase.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { RetryButton } from './RetryButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const until = new Date(2026, 9, 30, 21, 47)
const blocked = { blocked: true, until }
const free = { blocked: false, until: null }
const format = (time: string) => `Nouvel essai possible à ${time}`

const propsOf = (element: { props: unknown }) => element.props as Record<string, unknown>

describe('RetryButton', () => {
  afterEach(() => jest.restoreAllMocks())

  it('is an ordinary button while nothing blocks it', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <RetryButton label="Envoyer le lien" onPress={onPress} retry={free} format={format} />,
    )

    const button = screen.getByRole('button', { name: 'Envoyer le lien' })
    expect(button).toBeEnabled()
    expect(screen.queryByText(/Nouvel essai possible/)).toBeNull()
    expect(propsOf(button).accessibilityHint).toBeUndefined()
    await fireEvent.press(button)
    expect(onPress).toHaveBeenCalled()
  })

  it('is disabled while blocked, and shows at what time to try again', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <RetryButton label="Envoyer le lien" onPress={onPress} retry={blocked} format={format} />,
    )

    const button = screen.getByRole('button', { name: 'Envoyer le lien' })
    expect(button).toBeDisabled()
    expect(screen.getByText(/Nouvel essai possible à 21/)).toBeTruthy()
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('reads the time as a hint of the blocked button on a phone', async () => {
    await renderWithProviders(
      <RetryButton label="Envoyer le lien" onPress={() => {}} retry={blocked} format={format} />,
    )

    const button = screen.getByRole('button', { name: 'Envoyer le lien' })
    const phrase = screen.getByText(/Nouvel essai possible à 21/)
    expect(propsOf(button).accessibilityHint).toBe(phrase.props.children)
  })

  it('links the blocked button to the sentence on the web (aria-describedby)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <RetryButton label="Envoyer le lien" onPress={() => {}} retry={blocked} format={format} />,
    )

    const button = screen.getByRole('button', { name: 'Envoyer le lien' })
    const phrase = screen.getByText(/Nouvel essai possible à 21/)
    const id = propsOf(phrase).nativeID
    expect(id).toBeTruthy()
    expect(propsOf(button)['aria-describedby']).toBe(id)
  })

  it('stays disabled for its own reason once released (a password still missing)', async () => {
    await renderWithProviders(
      <RetryButton label="Envoyer le lien" onPress={() => {}} retry={free} disabled />,
    )

    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeDisabled()
  })

  it('describes nothing once free, even while the time is still known', async () => {
    // Un état improbable mais possible pendant un dessin : l'heure est connue, rien ne bloque.
    // Le bouton est libre et ne renvoie à aucune phrase.
    await renderWithProviders(
      <RetryButton
        label="Envoyer le lien"
        onPress={() => {}}
        retry={{ blocked: false, until }}
        format={format}
      />,
    )

    const button = screen.getByRole('button', { name: 'Envoyer le lien' })
    expect(button).toBeEnabled()
    expect(propsOf(button).accessibilityHint).toBeUndefined()
  })
})
