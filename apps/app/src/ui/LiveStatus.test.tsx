// Tests de la ligne d'état annoncée (relecture de l'interface de R3, C3) : une région « status »
// polie, toujours montée (vide plutôt qu'absente, sinon le lecteur d'écran ne l'annonce pas), qui
// demande à VoiceOver de lire chaque nouveau texte sur iOS (qui n'a pas de région vivante), et qui
// peut rester lue sans se montrer.
import { screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { LiveStatus } from './LiveStatus'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** La région, cherchée par son rôle (cachée ou non à l'œil). */
const region = () => screen.getByRole('status', { includeHiddenElements: true })

describe('LiveStatus', () => {
  it('is a polite status region that says its message', async () => {
    await renderWithProviders(<LiveStatus message="3 projets, 1 membre, 0 outil" />)

    expect(region()).toHaveTextContent('3 projets, 1 membre, 0 outil')
    expect(region().props.accessibilityLiveRegion).toBe('polite')
    expect(screen.getByText('3 projets, 1 membre, 0 outil')).toBeVisible()
  })

  it('stays mounted, empty, when there is nothing to say', async () => {
    await renderWithProviders(<LiveStatus message="" />)

    expect(region()).toHaveTextContent('')
  })

  it('can be read without being shown', async () => {
    await renderWithProviders(<LiveStatus message="0 projet, 0 membre, 0 outil" visible={false} />)

    expect(region()).toHaveTextContent('0 projet, 0 membre, 0 outil')
    expect(
      screen.getByText('0 projet, 0 membre, 0 outil', { includeHiddenElements: true }),
    ).not.toBeVisible()
  })

  it('asks VoiceOver to read each new message on iOS, not the first one', async () => {
    // iOS est la plateforme par défaut de Jest. Les appels des tests d'avant restent : on les oublie.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    announce.mockClear()
    const { rerender } = await renderWithProviders(<LiveStatus message="Recherche en cours…" />)

    // Au premier rendu, la page est lue en entier : pas d'annonce en plus.
    expect(announce).not.toHaveBeenCalled()

    await rerender(<LiveStatus message="3 projets, 1 membre, 0 outil" />)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenLastCalledWith('3 projets, 1 membre, 0 outil')

    // Le même texte n'est pas relu ; un texte vidé n'annonce rien.
    await rerender(<LiveStatus message="3 projets, 1 membre, 0 outil" />)
    await rerender(<LiveStatus message="" />)
    expect(announce).toHaveBeenCalledTimes(1)
  })
})
