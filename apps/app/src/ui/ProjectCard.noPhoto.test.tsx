// Tests de la carte de projet sans photo (tranche R18, « Les finitions », planche
// R18-Carte-Sans-Photo validée le 22/11/2026) : sur téléphone, une carte sans photo n'a plus la
// hauteur d'une carte à photo (476 points, 230 pour la compacte), avec un grand vide de lumière miel
// au-dessus du verre. Elle serre son verre : sa hauteur suit son contenu (310 points à texte normal
// sur la planche), la catégorie reste dans le verre, au-dessus du titre. À texte agrandi, le titre
// passe à quatre lignes au plus, sans jamais couper un mot (la garde `wholeWords` de `Text`), et
// l'accroche reste sur deux lignes. Le squelette garde la hauteur d'une carte à photo (le cas
// courant), et sur tablette comme sur ordinateur, rien ne change (choix 8 de la planche).
//
// Jest ne mesure aucune hauteur : on lit les règles écrites dans les styles (hauteurs minimales,
// `flexGrow`) et les props des textes (`numberOfLines`, `maxFontSizeMultiplier`). La hauteur exacte
// de la planche se mesure dans le navigateur, à part.
import { act, screen } from '@testing-library/react-native'
import {
  Dimensions,
  Platform,
  StyleSheet,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { categoryName } from '../testing/categories'
import { drawnSizes, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import {
  CardStretchContext,
  PROJECT_CARD_COMPACT_HEIGHT,
  PROJECT_CARD_HEIGHT,
  ProjectCard,
  ProjectCardSkeleton,
} from './ProjectCard'
import { ProjectMosaic } from './ProjectMosaic'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = {
  props: Record<string, unknown>
  parent: Node | null
  children: ReadonlyArray<Node | string>
}

const HIDDEN_TOO = { includeHiddenElements: true }

/** La carte de Papi Jean, la première de la planche : sans photo, avec sa catégorie. */
const card = {
  title: 'Les anniversaires de la famille',
  pitch: 'Un rappel la veille de chaque anniversaire, avec une idée de cadeau.',
  author: { name: 'Papi Jean', avatar: null },
  when: 'il y a 2 h',
  status: { label: 'En construction', strong: false },
  image: null,
  category: { label: categoryName('family'), icon: 'users-three' as const },
  reactionTotal: 23,
  tryIt: { label: fr.t(($) => $.explore.test), onPress: () => {} },
  onPress: () => {},
}
/** La photo de la carte voisine (« Carnet de cafés ») : le témoin d'une carte qui en a une. */
const photo = { source: { uri: 'https://api.example/cafes.webp' }, label: 'Carnet de cafés' }

/** Le titre de la planche à 200 % : « anniversaires », 13 lettres, son plus long mot. */
const LONGEST_WORD = 'anniversaires'

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
/** La fenêtre du test : sa largeur, sa hauteur et la taille du texte (2 pour 200 %). */
const setWindow = (width: number, height: number, fontScale = 1) => {
  const size = { width, height, scale: 2, fontScale }
  Dimensions.set({ window: size, screen: size })
}

beforeEach(() => {
  Dimensions.set({ window: phone, screen: phone })
})
afterEach(async () => {
  // Rend aussi la plateforme (`jest.replaceProperty`) au test suivant.
  jest.restoreAllMocks()
  await act(async () => Dimensions.set({ window: phone, screen: phone }))
})

const styleOf = (node: Node | null | undefined) =>
  (StyleSheet.flatten(node?.props.style as ViewStyle) ?? {}) as ViewStyle

/** La taille écrite d'un texte : un nombre en natif, une formule CSS (texte) sur le web. */
const fontSizeOf = (node: Node): unknown =>
  (StyleSheet.flatten(node.props.style as TextStyle) ?? {}).fontSize

/** La plus grande hauteur écrite (`height`, `minHeight`) de tout ce que la carte dessine. */
const tallestDrawn = () => Math.max(0, ...drawnSizes().heights)

/** Le titre de la carte, le texte affiché (le lien de la carte porte le même nom). */
const titleText = () => screen.getByText(card.title, HIDDEN_TOO) as unknown as Node

/** Les ancêtres du titre jusqu'au cadre du test (le titre compris), du plus proche au plus loin. */
const titleAncestors = () => {
  const chain: Node[] = []
  for (let node: Node | null = titleText(); node; node = node.parent) {
    if (node.props.testID === 'empty-piece-host') break
    chain.push(node)
  }
  return chain
}

/** Tous les nœuds de l'arbre rendu, dans l'ordre de lecture. */
const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

describe('ProjectCard without a photo, on a phone (R18)', () => {
  it('keeps the height of a photo card when it has a photo', async () => {
    // Témoin des tests suivants : la carte à photo garde ses 476 points.
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} image={photo} />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_HEIGHT)
  })

  it('no longer takes the height of a photo card: its height follows its content', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} />
      </PieceHost>,
    )

    expect(screen.getByRole('link', { name: card.title })).toBeTruthy() // témoin : la carte est là
    // Ni la carte, ni rien de ce qui l'entoure jusqu'au cadre, n'impose les 476 points d'une carte
    // à photo : le verre n'a plus de vide au-dessus de lui.
    for (const node of titleAncestors()) {
      expect(Number(styleOf(node).minHeight ?? 0)).toBeLessThan(PROJECT_CARD_HEIGHT)
      expect(Number(styleOf(node).height ?? 0)).toBeLessThan(PROJECT_CARD_HEIGHT)
    }
  })

  it('draws its honey light no taller than the card', async () => {
    // La lumière miel, posée sous le verre, ne garde pas la hauteur d'une photo : elle déborderait
    // sous la carte serrée.
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} />
      </PieceHost>,
    )

    expect(drawnSizes().heights.length).toBeGreaterThan(0) // témoin : des formes sont dessinées
    expect(tallestDrawn()).toBeLessThan(PROJECT_CARD_HEIGHT)
  })

  it('keeps its category in the glass, above the title', async () => {
    await renderWithProviders(<ProjectCard {...card} />)

    const nodes = hostsOf(screen.root as unknown as Node)
    const category = screen.getByText(card.category.label, HIDDEN_TOO) as unknown as Node
    const title = titleText()
    expect(nodes.indexOf(category)).toBeGreaterThanOrEqual(0) // témoin : l'étiquette est là
    expect(nodes.indexOf(category)).toBeLessThan(nodes.indexOf(title))
    // Dans le verre : l'étiquette et le titre ont un parent commun qui n'est pas la carte entière,
    // la colonne du titre (sur une carte à photo, l'étiquette est posée sur la photo, ailleurs).
    const titleColumn = title.parent as Node
    expect(hostsOf(titleColumn)).toContain(category)
  })

  it('lets a compact card without a photo follow its content, under 230 points', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} size="compact" />
      </PieceHost>,
    )

    expect(screen.getByRole('link', { name: card.title })).toBeTruthy() // témoin
    expect(tallestDrawn()).toBeLessThan(PROJECT_CARD_COMPACT_HEIGHT)
  })

  it('keeps 230 points for a compact card with a photo', async () => {
    // Témoin du test précédent.
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} image={photo} size="compact" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_COMPACT_HEIGHT)
  })

  it('stretches a compact card without a photo to the height of its row', async () => {
    // Dans une case de la mosaïque, à côté d'une compacte à photo, la carte sans photo prend la
    // hauteur de la rangée (230) par son étirement, pas par une hauteur minimale : deux compactes
    // sans photo côte à côte descendent ensemble à leur contenu (planche, rangée 3).
    await renderWithProviders(
      <PieceHost>
        <CardStretchContext.Provider value>
          <ProjectCard {...card} size="compact" />
        </CardStretchContext.Provider>
      </PieceHost>,
    )

    expect(titleAncestors().some((node) => styleOf(node).flexGrow === 1)).toBe(true)
    expect(tallestDrawn()).toBeLessThan(PROJECT_CARD_COMPACT_HEIGHT)
  })
})

describe('ProjectCard without a photo, larger text on a phone (R18)', () => {
  it('lets the title take up to four lines at 200 %', async () => {
    setWindow(390, 844, 2)
    await renderWithProviders(<ProjectCard {...card} />)

    expect(titleText().props.numberOfLines).toBe(4)
  })

  it('lets the title of a photo card take up to four lines at 200 % too', async () => {
    // Choix 3 de la planche : toutes les cartes du téléphone, avec ou sans photo.
    setWindow(390, 844, 2)
    await renderWithProviders(<ProjectCard {...card} image={photo} />)

    expect(titleText().props.numberOfLines).toBe(4)
  })

  it('keeps the title on two lines at the usual text size', async () => {
    // Témoin : « jusqu'à 4 lignes au lieu de 2 », seulement à texte agrandi.
    await renderWithProviders(<ProjectCard {...card} />)

    expect(titleText().props.numberOfLines).toBe(2)
  })

  it('never cuts a word of the title: the enlargement stops when the longest word fills the line', async () => {
    setWindow(390, 844, 2)
    // La garde de `Text` (`wholeWords`), rendue à côté pour lire l'agrandissement qu'elle permet.
    await renderWithProviders(
      <View>
        <ProjectCard {...card} />
        <Text variant="title3" wholeWords={card.title}>
          référence
        </Text>
      </View>,
    )

    const guarded = screen.getByText('référence').props.maxFontSizeMultiplier
    // Témoin : « anniversaires » (13 lettres) ne tiendrait pas doublé ; la garde l'arrête avant 2.
    expect(card.title).toContain(LONGEST_WORD)
    expect(guarded).toBeLessThan(2)
    expect(titleText().props.maxFontSizeMultiplier).toBe(guarded)
  })

  it('applies the same whole-word guard to the title on the web', async () => {
    // Sur le web, la garde est une formule CSS de la taille (le texte agrandi par le navigateur ne
    // se lit pas d'avance) : la même que celle de `Text` avec `wholeWords`.
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <View>
        <ProjectCard {...card} />
        <Text variant="title3" wholeWords={card.title}>
          référence
        </Text>
      </View>,
    )

    const guarded = fontSizeOf(screen.getByText('référence') as unknown as Node)
    expect(typeof guarded).toBe('string') // témoin : la formule existe
    expect(fontSizeOf(titleText())).toBe(guarded)
  })

  it('keeps the pitch on two lines at 200 %', async () => {
    // Choix 4 de la planche : l'accroche ne grandit pas en lignes (déjà vrai : garde de la règle).
    setWindow(390, 844, 2)
    await renderWithProviders(<ProjectCard {...card} />)

    expect(screen.getByText(card.pitch).props.numberOfLines).toBe(2)
  })
})

/** Les cases de la mosaïque (`listitem`), et les rangées qui en ont plus d'une. */
const cells = () =>
  hostsOf(screen.root as unknown as Node).filter((node) => node.props.role === 'listitem')
const sharedRows = () =>
  cells().filter(
    (cell) =>
      (cell.parent as Node).children.filter(
        (child) => typeof child !== 'string' && child.props.role === 'listitem',
      ).length > 1,
  )

describe('compact cards with larger text on a phone (R18)', () => {
  const items = Array.from({ length: 3 }, (_, rank) => ({ id: `p${rank}`, title: `P${rank}` }))
  const mosaic = () => (
    <ProjectMosaic
      items={items}
      render={(item) => <ProjectCard {...card} title={item.title} size="compact" />}
    />
  )

  it('puts two compact cards per row at the usual text size', async () => {
    // Témoin du test suivant.
    await renderWithProviders(mosaic())

    expect(cells()).toHaveLength(3)
    expect(sharedRows().length).toBeGreaterThan(0)
  })

  it('puts one compact card per row from 150 % of text', async () => {
    // Choix 5 de la planche : à deux par rangée, une compacte n'a que 127 points de texte, et
    // « Minuteur » se couperait (déjà vrai depuis R14 : garde de la règle, à 150 % et non 200 %).
    setWindow(390, 844, 1.5)
    await renderWithProviders(mosaic())

    expect(cells()).toHaveLength(3) // témoin : la mosaïque est là
    expect(sharedRows()).toHaveLength(0)
  })
})

describe('ProjectCardSkeleton stays the height of a photo card (R18)', () => {
  // Choix 7 de la planche : une carte à photo est le cas courant ; si la première carte arrive sans
  // photo, la suite remonte une seule fois, pendant le fondu. Déjà vrai : garde de la règle.
  it('keeps 476 points for the full card on a phone', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCardSkeleton />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_HEIGHT)
  })

  it('keeps 230 points for the compact card on a phone', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCardSkeleton size="compact" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_COMPACT_HEIGHT)
    expect(drawnSizes().heights).not.toContain(PROJECT_CARD_HEIGHT)
  })
})

describe('ProjectCard without a photo, beyond the phone (R18)', () => {
  // Choix 8 de la planche : sur tablette et ordinateur, les grilles gardent 476 et 230 (déjà vrai :
  // garde de la règle, qui doit survivre au changement du téléphone).
  it.each([
    ['a tablet', 834, 1112],
    ['a computer', 1440, 900],
  ])('keeps 476 points for a card without a photo on %s', async (_name, width, height) => {
    setWindow(width, height)
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_HEIGHT)
  })

  it.each([
    ['a tablet', 834, 1112],
    ['a computer', 1440, 900],
  ])('keeps 230 points for a compact card without a photo on %s', async (_name, width, height) => {
    setWindow(width, height)
    await renderWithProviders(
      <PieceHost>
        <ProjectCard {...card} size="compact" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_COMPACT_HEIGHT)
  })

  it('keeps the title on two lines on a computer', async () => {
    setWindow(1440, 900)
    await renderWithProviders(<ProjectCard {...card} />)

    expect(titleText().props.numberOfLines).toBe(2)
  })
})
