// QuotedContent : le contenu visé rappelé en citation (sorte, texte en trois lignes, ou vignette).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { QuotedContent } from './QuotedContent'

describe('QuotedContent', () => {
  it('recalls the kind and the text, in three lines at most', async () => {
    await renderWithProviders(<QuotedContent label="Commentaire" text="Envoie-moi ton code." />)

    expect(screen.getByText('Commentaire')).toBeTruthy()
    expect(screen.getByText('Envoie-moi ton code.').props.numberOfLines).toBe(3)
  })

  it('shows a named picture when it is given one', async () => {
    await renderWithProviders(
      <QuotedContent
        label="Message"
        picture={{ name: 'Photo', source: { uri: 'https://x.test/a.png' } }}
      />,
    )

    expect(screen.getByRole('image', { name: 'Photo' })).toBeTruthy()
  })

  it('shows only its kind without text nor picture', async () => {
    await renderWithProviders(<QuotedContent label="Profil" />)

    expect(screen.getByText('Profil')).toBeTruthy()
    expect(screen.queryByRole('image')).toBeNull()
  })
})
