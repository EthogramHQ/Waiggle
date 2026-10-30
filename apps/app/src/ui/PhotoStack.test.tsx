// Tests de la pile de photos (PhotoStack, tranche R2) : la photo du membre, puis trois couvertures
// de projets au plus. Un décor : la feuille qui la porte la cache aux lecteurs d'écran (Sheet).
import { screen } from '@testing-library/react-native'
import { renderWithI18n } from '../testing/render'
import { PhotoStack } from './PhotoStack'
import { SheetPanel } from './Sheet'
import { Text } from './Text'

const cover = (key: string) => ({ key, source: { uri: `https://api.example.com/${key}.webp` } })

describe('PhotoStack', () => {
  it('shows the member and at most three project covers', async () => {
    await renderWithI18n(
      <PhotoStack name="Léa" avatar={null} covers={['a', 'b', 'c', 'd'].map(cover)} />,
    )

    // Les initiales du membre (sans photo), puis trois images : la quatrième n'est pas montrée.
    expect(screen.getByText('LÉ')).toBeTruthy()
    const drawn = JSON.stringify(screen.toJSON())
    expect(['a', 'b', 'c', 'd'].map((key) => drawn.includes(`/${key}.webp`))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it('is hidden from screen readers as the decoration of a sheet', async () => {
    await renderWithI18n(
      <SheetPanel
        layout="phone"
        title="Supprimer ton compte"
        onClose={() => {}}
        decoration={<PhotoStack name="Léa" avatar={null} covers={[cover('a')]} />}
      >
        <Text>Contenu</Text>
      </SheetPanel>,
    )

    // Témoin : la feuille est là ; le décor, lui, n'est pas lu.
    expect(screen.getByText('Contenu')).toBeTruthy()
    expect(screen.queryByText('LÉ')).toBeNull()
    expect(screen.getByText('LÉ', { includeHiddenElements: true })).toBeTruthy()
  })
})
