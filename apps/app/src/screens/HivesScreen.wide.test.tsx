// Tests de l'onglet Ruches sur un grand écran (tranche R16, docs/scenarios/refonte.md, « Ruches,
// Recherche et Outils en grand » ; planches R16-Ruches-1920, R16-Ruches-1440 et
// R16-Ruches-Squelette-1920, validées le 17/11) :
// - dès 1 280 points, la page prend le gabarit large de R15 (`Screen width="wide"`) ;
// - une carte par ruche ; les invitations reçues et mes ruches dans une même grille : 4 colonnes à
//   1 920, 3 à 1 440 ; « Créer une ruche » reste en haut ;
// - sous 1 280, rien ne change (une colonne de lignes, à la largeur d'un formulaire) ;
// - le titre « Ruches » n'est affiché à aucune largeur, mais reste le titre de niveau 1 des
//   lecteurs d'écran (`titleHidden` de Screen) ;
// - pendant le chargement : « Mes ruches » et une rangée de cartes vides, sans invitation (choix 8
//   des planches : les invitations, rares, s'ajoutent au-dessus quand elles arrivent).
//
// Ce que ces tests supposent du code (à corriger si le code en décide autrement) : la carte
// d'une ruche est un lien nommé comme la ligne d'aujourd'hui (« Famille, 4 membres, animée par… ») ;
// la grille est faite de rangées, comme `ui/ProjectGrid` ; la carte vide s'appelle
// `HiveCardSkeleton`, exportée par `ui/HiveCard.tsx` (avec la carte, `HiveCard`).
//
// Jest ne mesure rien : on lit l'arbre (`testing/wideLayout.ts`), jamais un style.
import type { HiveInvitation, MyHives } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import {
  atWindow,
  heightOf,
  insideProgressbar,
  linesOf,
  piecesNamed,
  readBefore,
} from '../testing/wideLayout'
import { ToastProvider } from '../ui/theme/toast'
import {
  acceptNamed,
  faceOf,
  hiveServer,
  hoursAgo,
  invitation,
  lea,
  manyHives,
  nora,
  odile,
  resetHiveMocks,
  rowName,
  shown,
  T,
} from './Hives.testkit'
import { HivesScreen } from './HivesScreen'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

/** Les propriétés reçues par le cadre de page (`Screen`), notées par son faux module. */
const mockScreenProps: Record<string, unknown>[] = []

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) : ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())
// Le cadre de page, tel quel, mais dont le test lit les propriétés (`width`, `titleHidden`).
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
// R16 : la carte vide d'une ruche, telle quelle, dans une vue marquée de son nom (elle n'a ni rôle
// ni nom à elle, choix 4 du plan) : le test la compte. `virtual` : le module n'existe pas encore
// avant le code de la page ; ce faux module ne sert que lorsque l'écran l'importe.
jest.mock(
  '../ui/HiveCard',
  () => {
    const actual = jest.requireActual('../ui/HiveCard')
    const { createElement } = require('react')
    const { View } = require('react-native')
    return {
      ...actual,
      HiveCardSkeleton: (props: Record<string, unknown>) =>
        createElement(
          View,
          { testID: 'HiveCardSkeleton' },
          createElement(actual.HiveCardSkeleton, props),
        ),
    }
  },
  { virtual: true },
)

// --- Les données : cinq ruches et cinq invitations, de quoi remplir une rangée et en commencer une ---

const hives = manyHives(5)

/** Cinq invitations dans cinq ruches différentes, de Nora et de Tante Odile. */
const invitations: HiveInvitation[] = [
  'Atelier IA',
  'Jardins partagés',
  'La chorale',
  'Cuisine du dimanche',
  'Les randonneurs',
].map((name, index) => ({
  ...invitation,
  id: `1b2c3d4e-5f60-4a7b-8c9d-2000000000${String(index).padStart(2, '0')}`,
  hive: {
    ...invitation.hive,
    id: `1b2c3d4e-5f60-4a7b-8c9d-3000000000${String(index).padStart(2, '0')}`,
    name,
  },
  inviter: faceOf(index % 2 === 0 ? nora : odile),
  createdAt: hoursAgo(3 + index),
}))

const full: MyHives = { hives, invitations, createdCount: 1 }

beforeEach(() => {
  resetHiveMocks('/hives')
  mockScreenProps.length = 0
  mockSession({ user: { id: lea.id, name: lea.name } })
  hiveServer.mine = full
})

// --- Les aides ---

/** Ouvre l'onglet et attend « Mes ruches ». */
const openTab = async () => {
  await renderWithProviders(
    <ToastProvider>
      <HivesScreen />
    </ToastProvider>,
  )
  expect(await screen.findByRole('header', { name: T.mine })).toBeTruthy()
}

/** Les cartes (ou lignes) de mes ruches, dans l'ordre. */
const hiveLinks = () => hives.map((hive) => screen.getByRole('link', { name: rowName(hive) }))
/** Les invitations, chacune par son bouton « Rejoindre la ruche ». */
const invitationButtons = () =>
  invitations.map((one) => screen.getByRole('button', { name: acceptNamed(one.hive.name ?? '') }))

/** Le titre de la section des invitations, lu avec leur nombre (« Invitations, 5 invitations »). */
const invitationsHeading = () =>
  screen.getByRole('header', { name: new RegExp(`^${T.invitationsTitle}`) })

const lastScreen = () => mockScreenProps.at(-1)

// --- En grand ---

describe('HivesScreen on a wide computer screen (R16)', () => {
  it.each([1920, 1440])('lays Ruches out on the wide template at %i', (width) =>
    atWindow(width, heightOf(width), async () => {
      await openTab()

      expect(lastScreen()?.width).toBe('wide')
    }),
  )

  it.each([
    [1920, [4, 1]],
    [1440, [3, 2]],
  ])('puts my hives on cards in a grid at %i (%j per row)', (width, rows) =>
    atWindow(width, heightOf(width), async () => {
      await openTab()

      // Témoin : chaque ruche est là, son lien nommé comme la ligne d'aujourd'hui.
      expect(hiveLinks()).toHaveLength(5)
      expect(linesOf(hiveLinks()).sizes).toEqual(rows)
    }),
  )

  it.each([
    [1920, [4, 1]],
    [1440, [3, 2]],
  ])('puts the invitations on the same columns as my hives at %i', (width, rows) =>
    atWindow(width, heightOf(width), async () => {
      await openTab()

      expect(invitationButtons()).toHaveLength(5)
      expect(linesOf(invitationButtons()).sizes).toEqual(rows)
    }),
  )

  it('keeps the invitations above my hives, and « Créer une ruche » at the top', () =>
    atWindow(1920, 1080, async () => {
      await openTab()

      const create = screen.getByRole('button', { name: T.create })
      expect(readBefore(create, invitationsHeading())).toBe(true)
      expect(readBefore(invitationsHeading(), screen.getByRole('header', { name: T.mine }))).toBe(
        true,
      )
      // Les invitations gardent leur ordre, et passent avant la première ruche.
      const [firstInvitation] = invitationButtons()
      const [firstHive] = hiveLinks()
      expect(readBefore(firstInvitation, firstHive)).toBe(true)
    }))
})

// --- Sous 1 280 : rien ne change ---

describe('HivesScreen below 1 280 stays as it is today (R16)', () => {
  it('keeps one column of rows, at the width of a form, at 1 100', () =>
    atWindow(1100, 800, async () => {
      await openTab()

      // La page d'aujourd'hui : la largeur d'un formulaire (la valeur par défaut de Screen).
      expect(lastScreen()?.width ?? 'form').toBe('form')
      expect(linesOf(hiveLinks()).sizes).toEqual([1, 1, 1, 1, 1])
      expect(linesOf(invitationButtons()).sizes).toEqual([1, 1, 1, 1, 1])
    }))
})

// --- Le titre, caché à toutes les largeurs ---

describe('HivesScreen title (R16)', () => {
  it.each([390, 1100, 1440, 1920])(
    'keeps « Ruches » as the heading screen readers find, never shown, at %i',
    (width) =>
      atWindow(width, heightOf(width), async () => {
        await openTab()

        // Le titre de la page reste lu (le seul de niveau 1 de la page)…
        expect(screen.getByRole('header', { name: T.title })).toBeTruthy()
        // … mais n'est jamais affiché, quel que soit l'état dessiné.
        expect(mockScreenProps.length).toBeGreaterThan(0)
        expect(mockScreenProps.map((props) => props.titleHidden)).toEqual(
          mockScreenProps.map(() => true),
        )
        expect(mockScreenProps.map((props) => props.title)).toEqual(
          mockScreenProps.map(() => T.title),
        )
      }),
  )
})

// --- Le squelette (planche R16-Ruches-Squelette-1920) ---

/** Le chargement : « Chargement » lu une fois au moins (le squelette se montre après 160 ms). */
const loadingShown = async () =>
  expect(
    (await screen.findAllByRole('progressbar', { name: fr.t(($) => $.common.loading) })).length,
  ).toBeGreaterThan(0)

/** Ouvre l'onglet sans attendre la fin du chargement. */
const openLoading = () =>
  renderWithProviders(
    <ToastProvider>
      <HivesScreen />
    </ToastProvider>,
  )

describe('HivesScreen while it loads on a computer (R16)', () => {
  it.each([
    [1920, 4],
    [1440, 3],
  ])('draws « Mes ruches » and one row of empty hive cards at %i (%i cards)', (width, cards) =>
    atWindow(width, heightOf(width), async () => {
      // La liste des ruches reste en route.
      hiveServer.answer('GET', /^\/v1\/hives$/, () => new Promise(() => {}))
      await openLoading()
      await loadingShown()

      // Une rangée de cartes vides, aux colonnes de la page finie.
      expect(piecesNamed('HiveCardSkeleton')).toHaveLength(cards)
      // « Mes ruches » est déjà vrai, lu hors de la zone « Chargement ».
      const mine = screen.getByRole('header', { name: T.mine })
      expect(insideProgressbar(mine)).toBe(false)
      // Aucune invitation réservée : la rangée serait souvent vide.
      expect(shown(T.invitationsTitle)).toBe(false)
      // Le gabarit large et le titre caché, dès le squelette : rien ne bouge à l'arrivée.
      expect(lastScreen()?.width).toBe('wide')
      expect(lastScreen()?.titleHidden).toBe(true)
    }),
  )

  it('draws the same skeleton while the session is read', () =>
    atWindow(1920, 1080, async () => {
      mockSession(null, true)
      await openLoading()
      await loadingShown()

      expect(piecesNamed('HiveCardSkeleton')).toHaveLength(4)
      expect(insideProgressbar(screen.getByRole('header', { name: T.mine }))).toBe(false)
      expect(lastScreen()?.width).toBe('wide')
      expect(lastScreen()?.titleHidden).toBe(true)
    }))
})
