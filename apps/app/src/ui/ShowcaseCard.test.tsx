// Tests de la carte de la vitrine (tranche R12, `ui/ShowcaseCard`) : un seul lien, nommé par le
// titre du projet, décrit par son statut et son auteur ; la photo quand il y en a une, la lumière
// miel sinon ; un toucher ouvre le projet.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { SHOWCASE_CARD_SIZE, ShowcaseCard, ShowcaseCardSkeleton } from './ShowcaseCard'

const onPress = jest.fn()
beforeEach(() => onPress.mockClear())

const card = (overrides: Partial<Parameters<typeof ShowcaseCard>[0]> = {}) => (
  <ShowcaseCard
    title="Décollage !"
    author={{ name: 'Papi Jean', avatar: null }}
    image={{ source: { uri: 'https://example.test/rocket.webp' }, label: 'Décollage !' }}
    status={{ label: 'Testable', strong: true }}
    onPress={onPress}
    {...overrides}
  />
)

describe('ShowcaseCard (R12)', () => {
  it('is one link named by the project title', async () => {
    await renderWithProviders(card())

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Décollage !' })).toBeTruthy()
    // Rien d'autre à toucher dans la carte : ni bouton, ni lien vers l'auteur.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('shows the title, the status and the author', async () => {
    await renderWithProviders(card())

    expect(screen.getByText('Décollage !')).toBeTruthy()
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.getByText('Papi Jean')).toBeTruthy()
  })

  it('opens the project once per tap', async () => {
    await renderWithProviders(card())

    await fireEvent.press(screen.getByRole('link', { name: 'Décollage !' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is described by its status and its author on the web', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(card())

      const link = screen.getByRole('link', { name: 'Décollage !' })
      const ids = String((link.props as Record<string, unknown>)['aria-describedby'] ?? '').split(
        ' ',
      )
      // Le statut d'abord, puis l'auteur : les deux textes de la carte, par leur identifiant.
      const idOf = (text: string) => screen.getByText(text).props.nativeID as unknown
      expect(ids).toEqual([idOf('Testable'), idOf('Papi Jean')])
      expect(ids.every((id) => id.length > 0)).toBe(true)
    } finally {
      restore.restore()
    }
  })

  it('shows the photo when there is one, named for screen readers', async () => {
    await renderWithProviders(card())

    // Le lien et la photo portent tous deux le nom du projet.
    expect(screen.queryAllByLabelText('Décollage !')).toHaveLength(2)
  })

  it('shows the honey light without a photo, and announces no image', async () => {
    await renderWithProviders(card({ image: null }))
    // Sans photo, seul le lien porte le nom du projet : aucune image n'est annoncée.
    expect(screen.queryAllByLabelText('Décollage !')).toHaveLength(1)
  })

  it('never cuts an author name to a single line', async () => {
    await renderWithProviders(
      card({ author: { name: 'Marie-Bénédicte de La Fontaine', avatar: null } }),
    )

    expect(screen.getByText('Marie-Bénédicte de La Fontaine').props.numberOfLines).not.toBe(1)
  })
})

// R16 (scénario, « Sur l'accueil du visiteur, la vitrine garde sa place avec quatre cartes vides ») :
// la carte vide de la vitrine, à la place d'une carte de bande.
describe('ShowcaseCardSkeleton (R16)', () => {
  it('draws its empty piece without any role or name of its own', async () => {
    await renderWithProviders(
      <PieceHost>
        <ShowcaseCardSkeleton />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    // Des formes, d'abord : une pièce qui ne dessine rien ne garde aucune place.
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })

  it('takes the place of a showcase card in its band', async () => {
    await renderWithProviders(
      <PieceHost>
        <ShowcaseCardSkeleton />
      </PieceHost>,
    )

    expect(drawnSizes().widths).toContain(SHOWCASE_CARD_SIZE.width)
    expect(drawnSizes().heights).toContain(SHOWCASE_CARD_SIZE.height)
  })
})
