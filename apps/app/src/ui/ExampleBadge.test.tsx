// Tests de la pastille « Exemple » (tranche R12b, scénario « Les exemples ») : posée près du statut
// d'un projet ou du nom d'un compte d'exemples, elle dit que le projet est fictif. Elle a la forme
// de la pastille du statut (`StatusPill`) ; ici, on lit seulement ce qu'elle dit et à qui.
//
// L'interface attendue : `ui/ExampleBadge.tsx` exporte `ExampleBadge()`, sans props obligatoires.
import { screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ExampleBadge } from './ExampleBadge'

const example = fr.t(($) => $.common.example)

describe('ExampleBadge (R12b)', () => {
  it('says « Exemple »', async () => {
    await renderWithProviders(<ExampleBadge />)

    expect(screen.getByText(example)).toBeTruthy()
  })

  it('says « Example » in English', async () => {
    await renderWithProviders(<ExampleBadge />, 'en')

    expect(screen.getByText(createI18n('en').t(($) => $.common.example))).toBeTruthy()
  })

  it('is read by screen readers like the rest of the text', async () => {
    await renderWithProviders(<ExampleBadge />)

    // `getByText` ignore par défaut ce qui est caché aux lecteurs d'écran (`aria-hidden`,
    // `importantForAccessibility="no-hide-descendants"`…) : trouvé ainsi, le mot est lu.
    expect(screen.getByText(example)).toBeTruthy()
    // Aucun autre nom ne le remplace : s'il en a un, c'est le même mot.
    for (const named of screen.queryAllByLabelText(/./)) {
      const props = named.props as Record<string, unknown>
      expect(props.accessibilityLabel ?? props['aria-label']).toBe(example)
    }
  })

  it('is not something to touch', async () => {
    await renderWithProviders(<ExampleBadge />)

    // Témoin : la pastille est là.
    expect(screen.getByText(example)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
