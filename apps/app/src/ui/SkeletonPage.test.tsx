// Tests des formes de page vide (R16, « Les squelettes » ; plan, choix 4, 5, 11 et 12) : une page,
// une liste ou une carte qui charge se dessine avec les pièces vides des composants qu'elle attend
// (la carte de projet vide, l'en-tête vide d'un membre, la galerie vide, la ligne vide d'une liste),
// pour avoir la forme et la matière de ce qui arrive. Aucune pièce ne se nomme : le seul nom lu est
// celui du `Loading` de la zone, que l'appelant pose (et qu'il peut nommer, `label`).
//
// Jest ne calcule aucune position : on relève les mesures écrites sur les formes (`drawnSizes`), et
// on y cherche celles des vraies pièces, lues sur leurs composants ou sur la marque.
import { durations, layout } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { MemberCard } from './MemberCard'
import { PROJECT_CARD_COMPACT_HEIGHT, PROJECT_CARD_HEIGHT } from './ProjectCard'
import { Loading, SkeletonPage, type SkeletonPageShape, SkeletonRows } from './Skeleton'
import { ContentWidthContext } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
const desktop = { width: 1440, height: 900, scale: 2, fontScale: 1 }

/** Pose la fenêtre de cette taille (la classe de taille de l'appli la suit). */
const windowOf = async (size: typeof phone) => {
  await act(async () => Dimensions.set({ window: size, screen: size }))
}

afterEach(async () => {
  jest.useRealTimers()
  await windowOf(phone)
})

/** Les hauteurs dessinées sous le cadre, comptées : combien de fois celle-ci ? */
const timesDrawn = (height: number) =>
  drawnSizes().heights.filter((drawn) => drawn === height).length

/** Une forme de page dans son cadre repéré, dans une colonne de cette largeur. */
const page = (shape: SkeletonPageShape, room: number) =>
  renderWithProviders(
    <ContentWidthContext.Provider value={room}>
      <PieceHost>
        <SkeletonPage shape={shape} />
      </PieceHost>
    </ContentWidthContext.Provider>,
  )

describe('Loading', () => {
  it('reads the name its caller gives it, rather than « Chargement… »', async () => {
    await renderWithProviders(
      <Loading label="Profil en lecture" shown>
        <SkeletonRows count={2} />
      </Loading>,
    )

    expect(screen.getByRole('progressbar', { name: 'Profil en lecture' })).toBeBusy()
  })
})

describe('SkeletonRows', () => {
  it('draws the empty lines of a real list, at the height of its rows, without a name', async () => {
    await renderWithProviders(
      <PieceHost>
        <SkeletonRows count={5} />
      </PieceHost>,
    )

    // Cinq lignes vides de `ListGroup`, chacune à la hauteur d'une `ListRow`.
    expect(timesDrawn(layout.controlHeight.regular)).toBe(5)
    expect(emptyPiece().spoken).toEqual([])
  })
})

describe('SkeletonPage', () => {
  it('draws four empty project cards for the feed', async () => {
    await windowOf(desktop)
    await page('feed', 1000)

    expect(timesDrawn(PROJECT_CARD_HEIGHT)).toBe(4)
    expect(emptyPiece().spoken).toEqual([])
  })

  it('draws the centred header of a member, then the mosaic of four small cards, on a phone', async () => {
    await page('member', 358)

    const { heights } = drawnSizes()
    // L'en-tête centré du téléphone : la photo de 96 ; pas la colonne de l'ordinateur (128).
    expect(heights).toContain(96)
    expect(heights).not.toContain(128)
    expect(timesDrawn(PROJECT_CARD_COMPACT_HEIGHT)).toBe(4)
    expect(emptyPiece().spoken).toEqual([])
  })

  it('draws the profile column of a member beside the mosaic on a computer', async () => {
    await windowOf(desktop)
    await page('member', 1240)

    const { heights } = drawnSizes()
    // La colonne du profil : la photo de 128 dans son anneau, sous la bannière.
    expect(heights).toContain(128)
    expect(heights).not.toContain(96)
    expect(timesDrawn(PROJECT_CARD_COMPACT_HEIGHT)).toBe(4)
    expect(emptyPiece().spoken).toEqual([])
  })

  it('draws the empty gallery of a project at the height of the gallery that arrives', async () => {
    await page('project', 358)
    expect(drawnSizes().heights).toContain(layout.cover.band)
    // Le haut de la page : « Tester la démo », le grand bouton, vide.
    expect(drawnSizes().heights).toContain(layout.controlHeight.regular)
    expect(emptyPiece().spoken).toEqual([])
  })

  it('draws the hero gallery of a project on a computer', async () => {
    await windowOf(desktop)
    await page('project', 1240)

    expect(drawnSizes().heights).toContain(layout.cover.hero)
    expect(drawnSizes().heights).not.toContain(layout.cover.band)
    expect(emptyPiece().spoken).toEqual([])
  })
})

describe('MemberCard while the profile is read', () => {
  it('waits 160 ms before showing its empty name, like every loading zone', async () => {
    jest.useFakeTimers()
    await renderWithProviders(
      <MemberCard
        name={null}
        loadingLabel="Chargement…"
        avatar={null}
        avatarLabel="Photo de profil"
        edit={{ label: 'Modifier', onPress: () => {} }}
      />,
    )

    // Sa place est posée, mais cachée aux lecteurs d'écran le temps du délai…
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('progressbar', { includeHiddenElements: true })).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(durations.quick + 40)
    })
    // … puis elle se montre, nommée par l'écran.
    expect(screen.getByRole('progressbar', { name: 'Chargement…' })).toBeBusy()
  })
})
