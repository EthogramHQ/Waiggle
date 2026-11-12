// Le ton `neutral` d'une `Notice` (R8, planche `R8-Contexte`) : un constat gris, ni erreur ni
// réussite (« Ce commentaire n'est plus là. »), avec l'icône que l'écran choisit. Poli, il est lu
// sans couper la parole ; avec une `ref`, il peut recevoir le focus sur le web.
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, StyleSheet, type View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Notice } from './Notice'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const MESSAGE = 'Ce commentaire n’est plus là.'

describe('Notice, neutral tone', () => {
  it('is a polite status on a grey band, not an alert', async () => {
    await renderWithProviders(
      <Notice tone="neutral" icon="chat-circle-slash" polite message={MESSAGE} />,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(MESSAGE)
    expect(screen.queryByRole('alert')).toBeNull()
    const style = StyleSheet.flatten(status.props.style) as { backgroundColor?: string }
    expect(style.backgroundColor).toBe(palettes.day.surfaceGrouped)
  })

  it('can take the focus on the web when a screen holds it', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const ref = createRef<View>()
      await renderWithProviders(<Notice tone="neutral" polite message={MESSAGE} ref={ref} />)

      expect(screen.getByRole('status').props.tabIndex).toBe(-1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
