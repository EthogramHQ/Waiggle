// Test de la garde « aucun mot coupé » du titre de page de Screen (R19, relecture du design :
// « Classemen/t » coupé au milieu du mot à 200 % de texte sur 320 px). Le titre prend la formule de
// `wholeWords` (ui/Text.tsx) : sa taille est plafonnée par son plus long mot, texte doublé. Jest ne
// mesure aucune largeur : on lit la formule écrite sur le web ; la mesure est faite dans le
// navigateur à part.
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => jest.restoreAllMocks())

/** La taille écrite du titre de niveau 1 : sur le web, une formule CSS (texte). */
const titleSize = (name: string): unknown =>
  StyleSheet.flatten(screen.getByRole('header', { name }).props.style)?.fontSize

describe('Screen, whole words in the page title', () => {
  it('keeps every word of a page title whole', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <Screen title="Classement">
        <Text>Contenu</Text>
      </Screen>,
    )

    // 10 lettres, doublées par le texte agrandi, à 0,58 de la taille chacune : 11,60.
    expect(String(titleSize('Classement'))).toContain('calc((100vw - 48px) / 11.60)')
  })

  it('does the same when the title shares its row with an element beside it', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <Screen title="Notifications" titleAside={<Text>Réglages</Text>}>
        <Text>Contenu</Text>
      </Screen>,
    )

    // 13 lettres : 2 × 13 × 0,58 = 15,08.
    expect(String(titleSize('Notifications'))).toContain('calc((100vw - 48px) / 15.08)')
  })
})
