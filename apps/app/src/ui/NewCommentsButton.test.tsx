// Tests du bouton « 1 nouveau commentaire » (R21, choix 11 du plan) : quand des commentaires
// arrivent hors de vue pendant que le membre lit, la liste ne saute pas ; ce bouton paraît, et le
// toucher l'amène aux nouveaux. Cousin du bouton des nouveautés du fil (`NewItemsBanner`).
//
// Ce que le bouton reçoit : `count`, le nombre de commentaires arrivés hors de vue (0 : rien, le
// bouton n'est pas là), et `onPress`, ce que l'écran fait au toucher (amener aux nouveaux).
// L'arrivée est annoncée une seule fois au lecteur d'écran, sans prendre le focus ; un nouveau
// dessin avec le même nombre se tait.
import { fireEvent, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NewCommentsButton } from './NewCommentsButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')
const nameFor = (count: number) => plain(fr.t(($) => $.project.comments.newComments, { count }))

describe('NewCommentsButton', () => {
  it('is a button named after the number of new comments', async () => {
    await renderWithProviders(<NewCommentsButton count={1} onPress={() => {}} />)

    expect(screen.getByRole('button', { name: '1 nouveau commentaire' })).toBeTruthy()
  })

  it('uses the plural from two comments on', async () => {
    await renderWithProviders(<NewCommentsButton count={3} onPress={() => {}} />)

    expect(screen.getByRole('button', { name: '3 nouveaux commentaires' })).toBeTruthy()
    // Le même texte que la clé partagée (fr et en vivent dans packages/i18n).
    expect(nameFor(3)).toBe('3 nouveaux commentaires')
  })

  it('says it in English too', async () => {
    await renderWithProviders(<NewCommentsButton count={2} onPress={() => {}} />, 'en')

    expect(screen.getByRole('button', { name: '2 new comments' })).toBeTruthy()
  })

  it('is not there while nothing new arrived', async () => {
    await renderWithProviders(<NewCommentsButton count={0} onPress={() => {}} />)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('takes the member to the new comments when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<NewCommentsButton count={1} onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: '1 nouveau commentaire' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('announces the arrival once to the screen reader, without taking the focus', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    announce.mockClear()
    const { rerender } = await renderWithProviders(
      <NewCommentsButton count={0} onPress={() => {}} />,
    )
    expect(announce).not.toHaveBeenCalled()

    await rerender(<NewCommentsButton count={1} onPress={() => {}} />)
    // Un nouveau dessin avec le même nombre (l'écran se redessine) ne répète rien.
    await rerender(<NewCommentsButton count={1} onPress={() => {}} />)

    expect(announce).toHaveBeenCalledTimes(1)
    expect(plain(String(announce.mock.calls[0]?.[0]))).toBe('1 nouveau commentaire')
    announce.mockRestore()
  })

  it('announces a second arrival with the new number', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    announce.mockClear()
    const { rerender } = await renderWithProviders(
      <NewCommentsButton count={0} onPress={() => {}} />,
    )

    await rerender(<NewCommentsButton count={1} onPress={() => {}} />)
    await rerender(<NewCommentsButton count={2} onPress={() => {}} />)

    expect(announce.mock.calls.map(([message]) => plain(String(message)))).toEqual([
      '1 nouveau commentaire',
      '2 nouveaux commentaires',
    ])
    announce.mockRestore()
  })
})
