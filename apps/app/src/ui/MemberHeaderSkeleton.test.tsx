// Tests de l'en-tête vide d'un membre (R16, « Les squelettes ») au-delà du test de base (sans rôle
// ni nom, dans MemberHeader.test.tsx) : ouverte depuis une carte, la page connaît déjà le nom et la
// photo (plan R16, choix 10) ; l'en-tête vide les montre pour de vrai, le nom en titre, et dessine le
// reste en formes. Et la carte vide d'un membre (MemberCard.tsx), qui garde la place du lien.
import { layout, textStyles } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { MemberCard } from './MemberCard'
import { MemberHeaderSkeleton } from './MemberHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('MemberHeaderSkeleton, the header of a member page while it loads (R16)', () => {
  it('shows the name already known as the title of the page, the rest as empty shapes', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton name="Léa Moreau" avatar={null} />
      </PieceHost>,
    )

    expect(screen.getByRole('header', { name: 'Léa Moreau' })).toBeTruthy()
    // Rien d'autre ne se lit : ni pseudo, ni bio, ni « Chargement » (c'est le Loading de l'écran).
    expect(screen.queryByRole('progressbar')).toBeNull()
    // Les seuls textes : les initiales de sa photo et son nom.
    const texts = emptyPiece().spoken.filter((what) => what.startsWith('texte'))
    expect(texts).toEqual(['texte « LM »', 'texte « Léa Moreau »'])
  })

  it('draws the profile column on a computer without any role or name of its own', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton layout="column" />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
    // La photo de la colonne (128) et le nom à la hauteur d'une ligne du grand titre : les places
    // de la colonne qui arrive.
    const { heights } = drawnSizes()
    expect(heights).toContain(128)
    expect(heights).toContain(textStyles.display.lineHeight)
  })

  it('keeps the place of the action button', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton />
      </PieceHost>,
    )
    expect(drawnSizes().heights).toContain(layout.controlHeight.regular)
  })

  it('keeps no place for an action when the page has none', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton action={false} />
      </PieceHost>,
    )
    expect(drawnSizes().heights).not.toContain(layout.controlHeight.regular)
  })
})

describe('MemberCard while the profile is read (R16)', () => {
  it('keeps the 44-point place of the link that will arrive, under the empty name', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberCard
          name={null}
          loadingLabel="Chargement…"
          avatar={null}
          avatarLabel="Photo de profil"
          edit={{ label: 'Modifier', onPress: jest.fn() }}
        />
      </PieceHost>,
    )

    expect(await screen.findByRole('progressbar', { name: 'Chargement…' })).toBeTruthy()
    expect(drawnSizes().heights).toContain(layout.touchTarget)
  })
})
