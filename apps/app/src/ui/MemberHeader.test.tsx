// Tests de l'en-tête d'un membre.
//
// Tranche 7c : quand ses outils n'ont pas de lien (le profil verrouillé d'un compte suspendu, où
// seuls les noms des outils sont connus, pas leur étiquette), ils s'affichent en simples pastilles,
// jamais en liens ou en boutons qui ne mèneraient nulle part. (L'en-tête avec des liens est testé
// dans components.test.tsx.)
//
// Tranche R15 (docs/scenarios/refonte.md, « La page d'un membre », planche R15-Membre-1920) : sur
// ordinateur, l'en-tête devient une colonne à gauche de la page (`layout="column"`) : une bannière
// floue tirée de sa photo, cachée aux lecteurs d'écran (elle ne dit rien de plus que la photo), puis
// la photo, le nom, le pseudo et la bio rangés à gauche. Sans `layout`, l'en-tête de R14, centré.
import { screen } from '@testing-library/react-native'
import { type StyleProp, StyleSheet, type TextStyle } from 'react-native'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { MemberHeader, MemberHeaderSkeleton } from './MemberHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('MemberHeader, with tools that lead nowhere', () => {
  it('shows each tool as a plain pill, not a link nor a button', async () => {
    await renderWithProviders(
      <MemberHeader
        name="Karim"
        handle="@karim_b"
        avatar={null}
        bio="Des petits jeux faits avec Cursor."
        toolsTitle="Outils favoris"
        tools={[{ label: 'Cursor' }, { label: 'ChatGPT', onPress: undefined }]}
      />,
    )

    // Témoins : l'en-tête est là, avec la liste des outils.
    expect(screen.getByRole('header', { name: 'Karim' })).toBeTruthy()
    expect(screen.getByText('Outils favoris')).toBeTruthy()
    for (const tool of ['Cursor', 'ChatGPT']) {
      expect(screen.getByText(tool)).toBeTruthy()
      expect(screen.queryByRole('link', { name: tool })).toBeNull()
      expect(screen.queryByRole('button', { name: tool })).toBeNull()
    }
  })
})

// --- R15 : la forme en colonne ---

const PHOTO = 'https://media.example.com/lea.jpg'
const BIO = 'Barista le week-end, développeuse le reste du temps.'

type Host = { props: Record<string, unknown>; parent: Host | null; children: (Host | string)[] }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/**
 * Les images dessinées à partir de la photo de Léa, par leur source mise en texte (expo-image range
 * l'adresse dans un tableau de sources).
 */
const imagesOfThePhoto = () =>
  hostsOf(screen.root as unknown as Host).filter(
    (node) => node.props.source !== undefined && JSON.stringify(node.props.source).includes(PHOTO),
  )

/** Vrai si l'élément, ou un de ses parents, est caché aux lecteurs d'écran (web et téléphone). */
const hiddenFromReaders = (start: Host) => {
  for (let node: Host | null = start; node; node = node.parent) {
    const { props } = node
    if (
      props['aria-hidden'] === true ||
      props.accessibilityElementsHidden === true ||
      props.importantForAccessibility === 'no-hide-descendants'
    )
      return true
  }
  return false
}

/** L'alignement du texte tel que le pose la vue de texte elle-même. */
const textAlignOf = (element: { props: Record<string, unknown> }) =>
  StyleSheet.flatten(element.props.style as StyleProp<TextStyle>)?.textAlign

const lea = {
  name: 'Léa Moreau',
  handle: '@lea_moreau',
  avatar: { uri: PHOTO },
  bio: BIO,
  toolsTitle: 'Outils favoris',
  tools: [{ label: 'Claude', onPress: () => {} }],
}
// La prop est écrite telle quelle (pas étalée d'un objet) : le typage vérifie qu'elle existe.
const renderLea = (layout?: 'column') =>
  renderWithProviders(
    layout ? <MemberHeader {...lea} layout={layout} /> : <MemberHeader {...lea} />,
  )

describe('MemberHeader, as the profile column of a computer (R15)', () => {
  it('draws a banner from the photo, hidden from screen readers, in the column layout', async () => {
    await renderLea('column')

    const images = imagesOfThePhoto()
    // La photo du membre, et la bannière tirée de la même photo.
    expect(images.length).toBeGreaterThanOrEqual(2)
    // La photo reste nommée ; la bannière, décorative, n'est pas lue.
    expect(images.filter(hiddenFromReaders).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText('Léa Moreau')).toBeTruthy()
  })

  it('keeps the centered header of R14, without banner, when no layout is given', async () => {
    await renderLea()

    // Témoin de la forme de R14 : la photo seule, le nom centré.
    expect(imagesOfThePhoto()).toHaveLength(1)
    expect(textAlignOf(screen.getByRole('header', { name: 'Léa Moreau' }))).toBe('center')
  })

  it('aligns the name, the handle and the bio to the left in the column layout', async () => {
    await renderLea('column')

    // La règle : rien n'est centré dans la colonne (planche R15-Membre-1920).
    expect(textAlignOf(screen.getByRole('header', { name: 'Léa Moreau' }))).not.toBe('center')
    expect(textAlignOf(screen.getByText('@lea_moreau'))).not.toBe('center')
    expect(textAlignOf(screen.getByText(BIO))).not.toBe('center')
  })
})

// R16 (plan, choix 4) : l'en-tête vide de la page d'un membre (sa photo et son nom à venir).
describe('MemberHeaderSkeleton (R16)', () => {
  it('draws its empty piece without any role or name of its own', async () => {
    await renderWithProviders(
      <PieceHost>
        <MemberHeaderSkeleton />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    // Des formes, d'abord : une pièce qui ne dessine rien ne garde aucune place.
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })
})
