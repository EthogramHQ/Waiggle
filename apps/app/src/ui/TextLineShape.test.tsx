// Tests de la ligne de texte vide (R16 ; relecture de l'interface R16, A3) : elle prend la hauteur
// d'une ligne écrite dans son style, et grandit comme le vrai texte quand le téléphone est réglé en
// grande taille de texte (jusqu'à 200 %, 150 % pour un grand titre, les bornes de `Text`). Sinon, la
// page sautait à l'arrivée des vraies lignes.
import { maxHeadingScale, textStyles } from '@ruche/brand'
import { act } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { TextLineShape } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const setFontScale = (fontScale: number) =>
  act(async () => {
    const phone = { width: 390, height: 844, scale: 3, fontScale }
    Dimensions.set({ window: phone, screen: phone })
  })

afterEach(() => setFontScale(1))

describe('TextLineShape', () => {
  it('takes the height of a written line of its style, and says nothing', async () => {
    await renderWithProviders(
      <PieceHost>
        <TextLineShape variant="body" width="60%" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(textStyles.body.lineHeight)
    expect(emptyPiece().spoken).toEqual([])
  })

  it('grows with the text size of the phone, as the real line does', async () => {
    await setFontScale(2)
    await renderWithProviders(
      <PieceHost>
        <TextLineShape variant="body" width="60%" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(textStyles.body.lineHeight * 2)
    expect(drawnSizes().heights).not.toContain(textStyles.body.lineHeight)
  })

  it('stops where the text stops: twice for body text, one and a half for a big title', async () => {
    await setFontScale(3)
    await renderWithProviders(
      <PieceHost>
        <TextLineShape variant="callout" width="60%" />
        <TextLineShape variant="title1" width="45%" />
      </PieceHost>,
    )

    const { heights } = drawnSizes()
    expect(heights).toContain(textStyles.callout.lineHeight * 2)
    expect(heights).toContain(Math.round(textStyles.title1.lineHeight * maxHeadingScale))
  })
})
