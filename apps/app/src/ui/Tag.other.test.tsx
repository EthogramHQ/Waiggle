// Tests de l'étiquette d'un « Autre », après la relecture de R6b (design C2, interface C4) : un outil
// hors du catalogue n'a pas de page, il ne doit donc pas ressembler à une pastille-lien. Il se
// dessine autrement (un contour en tirets, sans fond plein), et son nom, tapé par un membre et
// qu'aucune page ne permet de relire, passe à la ligne au lieu d'être abrégé par « … ». Il garde son
// rôle et son nom lu complet.
import { screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Tag } from './Tag'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LONG = 'gpt-4o-mini-2024-07-18-instruct-previews'

/** Le style de la pastille dessinée autour d'un libellé : la vue qui porte son bord. */
const boxOf = (label: string) => {
  let at = screen.getByText(label).parent
  for (; at; at = at.parent) {
    const style = StyleSheet.flatten(at.props.style) as { borderWidth?: number } | undefined
    if (style?.borderWidth !== undefined) return StyleSheet.flatten(at.props.style)
  }
  throw new Error(`no box around ${label}`)
}

describe('Tag of a tool outside the catalogue', () => {
  it('is not drawn like a link pill', async () => {
    await renderWithProviders(
      <View>
        <Tag label="Claude Code" onPress={() => {}} />
        <Tag label="Teachable Machine" inCatalogue={false} />
      </View>,
    )

    const link = boxOf('Claude Code')
    const other = boxOf('Teachable Machine')
    expect(other.borderStyle).toBe('dashed')
    expect(link.borderStyle ?? 'solid').toBe('solid')
    expect(other.backgroundColor).not.toBe(link.backgroundColor)
  })

  it('lets a long name wrap instead of cutting it with « … »', async () => {
    await renderWithProviders(<Tag label={LONG} inCatalogue={false} />)

    expect(screen.getByText(LONG).props.numberOfLines ?? 0).toBe(0)
  })

  it('keeps its full spoken name, and is no link', async () => {
    await renderWithProviders(<Tag label={LONG} inCatalogue={false} onPress={() => {}} />)

    expect(screen.getByLabelText(fr.t(($) => $.tool.otherSpoken, { name: LONG }))).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
