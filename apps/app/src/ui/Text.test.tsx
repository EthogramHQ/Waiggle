// Tests des rôles de texte de Miel 2 (tranche R1) : le nom géant d'un outil tient sur une ligne
// (il rétrécit au lieu de passer à la ligne au milieu d'un mot), et les rôles à chasse fixe (mono,
// code) ne demandent jamais une police que l'appli n'a pas chargée.
import { maxHeadingScale, maxTextScale, type TextVariant, textStyles } from '@ruche/brand'
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

// Les grands titres grossissent moins que le texte courant (R4, M5) : à 320 points et 200 % de texte,
// « Réglages » en titre de page se coupait au milieu du mot.
describe('Text, the page and section titles', () => {
  const multiplier = (text: string) => screen.getByText(text).props.maxFontSizeMultiplier

  it.each([1, 2] as const)(
    'grow less than body text when they are level %i headings',
    async (level) => {
      await renderWithProviders(
        <Text variant="title2" heading={level}>
          Réglages
        </Text>,
      )

      expect(multiplier('Réglages')).toBe(maxHeadingScale)
      expect(maxHeadingScale).toBeLessThan(maxTextScale)
    },
  )

  it('follow the screen width on the web, never above their size token', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <Text variant="title2" heading={1}>
          Réglages
        </Text>,
      )

      expect(String(styleOf('Réglages').fontSize)).toBe('min(34px, 8.50vw)')
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keep a small section title (a group caption) at the full body size scale', async () => {
    await renderWithProviders(
      <Text variant="caption" heading={2}>
        Langue
      </Text>,
    )

    expect(multiplier('Langue')).toBe(maxTextScale)
  })

  it('leave the markdown headings of members (levels 3 and 4) at the full scale', async () => {
    await renderWithProviders(
      <Text variant="heading" heading={3}>
        La recette
      </Text>,
    )

    expect(multiplier('La recette')).toBe(maxTextScale)
  })

  it('let a caller choose its own limit', async () => {
    await renderWithProviders(
      <Text variant="title2" heading={1} maxScale={1.2}>
        Waiggle
      </Text>,
    )

    expect(multiplier('Waiggle')).toBe(1.2)
  })
})

// R13 (relecture du plan, décision 4) : sur le web, une police de la marque arrive après le texte
// (`font-display: swap`) ; d'ici là, le navigateur prend une police du système de la même famille :
// sans empattement pour Funnel, à chasse fixe pour Geist Mono. Sur téléphone, le nom seul : une
// liste de polices n'y veut rien dire, et casserait la police.
describe('Text, the fallback of the brand fonts', () => {
  const generic = { display: 'sans-serif', text: 'sans-serif', mono: 'monospace' } as const
  const variants = Object.keys(textStyles) as TextVariant[]

  it('ends every web font family with a generic fallback of the same kind', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <>
          {variants.map((variant) => (
            <Text key={variant} variant={variant}>{`texte ${variant}`}</Text>
          ))}
        </>,
      )

      for (const variant of variants) {
        const family = styleOf(`texte ${variant}`).fontFamily ?? ''
        const [brand, ...rest] = family.split(',').map((name) => name.trim())
        // D'abord la police de la marque, livrée par l'appli ; puis sa police de secours calibrée
        // (R16, ui/theme/fontFallback.ts) ; puis la famille du système, seule.
        expect(Object.keys(fontFiles)).toContain(brand)
        expect(rest).toEqual([`${brand}-fallback`, generic[textStyles[variant].family]])
      }
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('names the brand font alone on a phone', async () => {
    await renderWithProviders(<Text variant="body">Sur téléphone</Text>)

    expect(Object.keys(fontFiles)).toContain(styleOf('Sur téléphone').fontFamily)
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
