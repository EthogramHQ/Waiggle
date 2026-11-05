// Tests de la garde « aucun mot coupé » du titre compté (R5b, « Commentaires (7) » coupé au milieu
// du mot à 200 % et 320 px, listes « À reprendre ») : le titre et son nombre prennent la même
// taille, calculée pour que leur plus long bloc insécable tienne sur une ligne, texte doublé.
// Jest ne mesure aucune largeur : on vérifie la règle (la formule et l'agrandissement permis),
// la mesure dans le navigateur est faite à part.
import { screen } from '@testing-library/react-native'
import { Dimensions, Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CountedTitle } from './CountedTitle'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const header = (name: string) => screen.getByRole('header', { name })
/** La taille écrite d'un texte : un nombre en natif, une formule CSS (texte) sur le web. */
const sizeOf = (node: ReturnType<typeof header>): unknown =>
  StyleSheet.flatten(node.props.style)?.fontSize

afterEach(() => jest.restoreAllMocks())

describe('CountedTitle, whole words', () => {
  it('on the web, gives the title and its number the same size, capped by the longest word', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <CountedTitle
        title="Commentaires"
        count={6}
        spokenCount="6 commentaires"
        separator="space"
        variant="title2"
      />,
    )

    const title = header('Commentaires, 6 commentaires')
    const number = screen.getByText(/6$/)
    // 12 lettres, doublées par le texte agrandi, à 0,58 de la taille chacune : 13,92.
    expect(sizeOf(title)).toBe('min(34px, 8.50vw, calc((100vw - 48px) / 13.92))')
    expect(sizeOf(number)).toBe(sizeOf(title))
  })

  it('counts the non-breaking dot block as one word', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <CountedTitle title="Mes projets" count={3} spokenCount="3 projets" />,
    )

    // « projets · 3 » ne se coupe pas : 11 caractères, 2 × 11 × 0,58 = 12,76.
    expect(sizeOf(header('Mes projets, 3 projets'))).toBe(
      'min(22px, 5.50vw, calc((100vw - 48px) / 12.76))',
    )
  })

  it('on a phone, stops the enlargement where the longest word would fill the window', async () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 2 })
    await renderWithProviders(
      <CountedTitle
        title="Commentaires"
        count={6}
        spokenCount="6 commentaires"
        separator="space"
        variant="title2"
      />,
    )

    const title = header('Commentaires, 6 commentaires')
    const number = screen.getByText(/6$/)
    // (320 − 48) / (12 × 0,58 × 34) ≈ 1,15 : moins que l'agrandissement d'un grand titre (1,5).
    expect(title.props.maxFontSizeMultiplier).toBeCloseTo(272 / (12 * 0.58 * 34), 5)
    expect(number.props.maxFontSizeMultiplier).toBe(title.props.maxFontSizeMultiplier)
  })

  it('keeps the usual enlargement of a short title on a phone', async () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 2 })
    await renderWithProviders(<CountedTitle title="Projets" count={2} spokenCount="2 projets" />)

    const title = header('Projets, 2 projets')
    expect(title.props.maxFontSizeMultiplier).toBe(1.5)
    expect(screen.getByText(/2$/).props.maxFontSizeMultiplier).toBe(1.5)
  })
})
