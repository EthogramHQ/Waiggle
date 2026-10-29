// Tests du logo dessiné (R1) : ce qu'en lit un lecteur d'écran, quelle que soit sa variante. Ils ne
// regardent ni ses tracés ni ses couleurs, qui se vérifient sur les captures du catalogue.
import { appName } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Logo } from './Logo'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le nom que lit un lecteur d'écran : « Logo de Waiggle ». */
const logoAlt = fr.t(($) => $.brand.logoAlt)

describe('Logo', () => {
  // L'abeille et le « w », l'abeille seule, ou le tout d'une seule couleur : c'est toujours une
  // image unique, nommée, jamais une suite de tracés lus un par un.
  it.each(['full', 'bee', 'tinted'] as const)(
    'is a single image named after the app (%s)',
    async (variant) => {
      await renderWithProviders(<Logo variant={variant} />)

      expect(screen.getAllByRole('img')).toHaveLength(1)
      expect(screen.getByRole('img', { name: logoAlt })).toBeTruthy()
    },
  )

  it('shows the whole logo by default', async () => {
    await renderWithProviders(<Logo />)

    expect(screen.getByRole('img', { name: logoAlt })).toBeTruthy()
  })

  // Le nom vient des traductions et du nom de l'appli (@ruche/brand), jamais écrit en dur.
  it('is named in the language of the app', async () => {
    await renderWithProviders(<Logo variant="bee" />, 'en')

    expect(screen.getByRole('img', { name: `${appName} logo` })).toBeTruthy()
  })

  // À côté d'un texte qui dit déjà le nom (le mot « waiggle »), le logo se tait : il est caché aux
  // lecteurs d'écran, mais toujours dessiné.
  it('is hidden from screen readers when decorative', async () => {
    await renderWithProviders(<Logo variant="bee" decorative />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('img', { name: logoAlt, includeHiddenElements: true })).toBeTruthy()
  })
})
