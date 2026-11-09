// Tests de l'en-tête de la page d'un outil (tranche R6b, scénario « La page d'un outil », planches
// `R6-Outil` et `R6-Outil-Desktop` ; relecture du plan ui-B1 et point 15). Le nom en très grand
// (« Lovable », rôles de lettres `toolName` sur téléphone et `toolNameWide` sur ordinateur), qui est
// le titre de niveau 1 de la page ; sa lettre ; « 34 projets » et sa famille (« Sans code ») ; sa
// description dans la langue du visiteur, puis « Description écrite par Waiggle, sans lien avec
// l'éditeur de l'outil. » (relecture juridique jur-T7) ; et l'adresse de son site (« lovable.dev
// ↗ »), un lien nommé par son hôte, qui dit qu'il passe par la page « Tu quittes Waiggle ».
//
// L'API (découpage amendé de R6b, U2c) : ToolHeader({ name; projects: string; family: string;
// description: string | null; disclaimer: string; site: { host; onPress } | null; layout: 'phone' |
// 'wide' }). Les textes arrivent tout faits de l'écran, sauf le nom lu du lien du site, que
// l'en-tête compose (`tool.siteLink`).
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToolHeader } from './ToolHeader'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const PROJECTS = fr.t(($) => $.tools.projects, { count: 34 })
const FAMILY = fr.t(($) => $.tools.family['no-code'])
const DESCRIPTION = 'Un outil qui écrit une application web à partir d’une description.'
const DISCLAIMER = fr.t(($) => $.tool.disclaimer)
const SITE_NAME = fr.t(($) => $.tool.siteLink, { host: 'lovable.dev' })

type Props = Parameters<typeof ToolHeader>[0]
const props = (over: Partial<Props> = {}): Props => ({
  name: 'Lovable',
  projects: PROJECTS,
  family: FAMILY,
  description: DESCRIPTION,
  disclaimer: DISCLAIMER,
  site: { host: 'lovable.dev', onPress: () => {} },
  layout: 'phone',
  ...over,
})

describe('ToolHeader', () => {
  it('composes its texts from the translations (witness)', () => {
    expect(PROJECTS).toBe('34 projets')
    expect(FAMILY).toBe('Sans code')
    expect(DISCLAIMER).toMatch(/^Description écrite par .+, sans lien avec l’éditeur de l’outil\.$/)
    expect(DISCLAIMER).not.toContain('{{')
    expect(SITE_NAME).toBe('lovable.dev, s’ouvre après une page d’avertissement')
  })

  it('shows the tool name as the level 1 heading', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<ToolHeader {...props()} />)

      const heading = screen.getByRole('header', { name: 'Lovable' })
      expect(heading.props['aria-level']).toBe(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps the name as the level 1 heading on a wide screen', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<ToolHeader {...props({ layout: 'wide' })} />)

      expect(screen.getByRole('header', { name: 'Lovable' }).props['aria-level']).toBe(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('shows the number of projects, the family, the description and who wrote it', async () => {
    await renderWithProviders(<ToolHeader {...props()} />)

    expect(screen.getByText(containing(PROJECTS))).toBeTruthy()
    expect(screen.getByText(containing(FAMILY))).toBeTruthy()
    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(screen.getByText(DISCLAIMER)).toBeTruthy()
  })

  it('draws the initial of the tool as its image', async () => {
    await renderWithProviders(<ToolHeader {...props()} />)

    // La lettre décore : le nom est déjà écrit et lu par le titre.
    expect(screen.getByText('L', { includeHiddenElements: true })).toBeTruthy()
  })

  it('names the site link with its host and says it goes through the leaving page', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<ToolHeader {...props({ site: { host: 'lovable.dev', onPress } })} />)

    const link = screen.getByRole('link', { name: SITE_NAME })
    // L'hôte se voit aussi (« lovable.dev ↗ »).
    expect(screen.getByText(containing('lovable.dev'))).toBeTruthy()
    // Le lien ne s'ouvre pas lui-même : l'écran montre d'abord la page « Tu quittes… ».
    await fireEvent.press(link)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows no site link for a tool without a site', async () => {
    await renderWithProviders(<ToolHeader {...props({ site: null })} />)

    expect(screen.getByRole('header', { name: 'Lovable' })).toBeTruthy() // témoin
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows no description for a tool without one', async () => {
    await renderWithProviders(<ToolHeader {...props({ description: null })} />)

    expect(screen.getByRole('header', { name: 'Lovable' })).toBeTruthy() // témoin
    expect(screen.queryByText(DESCRIPTION)).toBeNull()
  })
})
