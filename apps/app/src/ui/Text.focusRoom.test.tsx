// Tests de la prop `focusRoom` de `Text` (R6b, restes de R5b) : un texte replié sur le web rogne ce
// qui dépasse sa boîte, l'anneau de focus d'une pastille de mention en tête compris. La prop recule ce
// rognage en haut et sur les côtés, sans rien déplacer (marge intérieure rattrapée par une marge
// extérieure négative). Que l'anneau se voie, seul le navigateur le montre : ici, la règle.
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet, type TextStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const styleOf = (text: string) =>
  StyleSheet.flatten(screen.getByText(text).props.style as TextStyle) ?? {}

const onWeb = async (run: () => Promise<void>) => {
  const restore = jest.replaceProperty(Platform, 'OS', 'web')
  try {
    await run()
  } finally {
    restore.restore()
  }
}

describe('Text focusRoom', () => {
  it('makes room for a focus ring above and beside a folded text on the web, without moving it', async () => {
    await onWeb(async () => {
      await renderWithProviders(
        <Text focusRoom numberOfLines={10}>
          Un long commentaire replié
        </Text>,
      )
      const style = styleOf('Un long commentaire replié')
      expect(Number(style.paddingTop)).toBeGreaterThan(0)
      expect(style.marginTop).toBe(-Number(style.paddingTop))
      expect(style.marginHorizontal).toBe(-Number(style.paddingHorizontal))
      // Pas en bas : la ligne d'après le pli se verrait dans cette marge.
      expect(style.paddingBottom ?? 0).toBe(0)
      expect(style.paddingVertical).toBeUndefined()
    })
  })

  it('changes nothing on an unfolded text', async () => {
    await onWeb(async () => {
      await renderWithProviders(<Text focusRoom>Un commentaire déplié</Text>)
      const style = styleOf('Un commentaire déplié')
      expect(style.paddingTop).toBeUndefined() // témoin : le texte est bien celui-là
      expect(style.marginTop).toBeUndefined()
    })
  })
})
