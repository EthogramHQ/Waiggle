// Tests des rôles de texte de Miel 2 (tranche R1) : le nom géant d'un outil tient sur une ligne
// (il rétrécit au lieu de passer à la ligne au milieu d'un mot), et les rôles à chasse fixe (mono,
// code) ne demandent jamais une police que l'appli n'a pas chargée.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Text } from './Text'
import { fontFiles } from './theme/fonts'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Style = { fontFamily?: string; fontSize?: number | string }
const styleOf = (text: string): Style => screen.getByText(text).props.style as Style

describe('Text, the giant tool name', () => {
  it('shrinks to one line on a phone', async () => {
    await renderWithProviders(<Text variant="toolName">Stable Diffusion XL Turbo</Text>)

    const name = screen.getByText('Stable Diffusion XL Turbo')
    expect(name).toHaveProp('numberOfLines', 1)
    expect(name).toHaveProp('adjustsFontSizeToFit', true)
  })

  it('takes a size that depends on the screen on the web, never above its token', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Text variant="toolNameWide">Claude Code</Text>)

      expect(String(styleOf('Claude Code').fontSize)).toMatch(/^clamp\(.*, 100px\)$/)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('Text, the monospaced roles', () => {
  it.each(['mono', 'code'] as const)(
    'never asks for a font the app did not load (%s)',
    async (variant) => {
      await renderWithProviders(<Text variant={variant}>v2.3.1</Text>)

      const family = styleOf('v2.3.1').fontFamily ?? ''
      // Soit une police livrée (Geist Mono, dès qu'elle l'est), soit une police du système, qui
      // ne porte pas le nom d'une famille livrée.
      expect(family in fontFiles || !family.startsWith('GeistMono')).toBe(true)
    },
  )
})
