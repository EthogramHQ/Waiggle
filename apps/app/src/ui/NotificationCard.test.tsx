// Tests d'une ligne de la page « Activité » (ui/NotificationCard.tsx), redessinée en R8 (planches
// R8-Activite, R8-Activite-Plus, R8-Activite-Nuit) : sans cadre, le fond miel (`highlightSoft`) si
// elle est nouvelle, à gauche l'avatar de qui a agi ou une icône, à droite la miniature du projet ou
// la tuile de l'outil, la phrase en morceaux (gras pour les noms et titres), la date relative, une
// bulle pour la citation. Avec `onPress`, toute la ligne est un lien, nommé par tout ce qu'elle dit,
// sa date et « Nouveau » si elle l'est ; sans (`onPress: null`), ni lien ni bouton, et « Nouveau »,
// caché à l'œil, se lit quand même.
//
// Repris du bloc « NotificationCard » de components.test.tsx (prop `text=` d'avant R8).
//
// L'API (plan, « API des modules partagés », revue UI-A1) :
//   leading: { kind: 'avatar'; name; image: ImageSource | null } | { kind: 'icon'; icon; tone }
//   parts: { text; style?: 'strong' | 'version' }[] ; when: string | { date; now? }
//   quote?, reactions?, version?, detail?, thumb?: { kind: 'project'; image: CoverImage | null;
//   title } | { kind: 'tool'; name } | null ; isNew ; onPress: (() => void) | null
import { palettes } from '@ruche/brand'
import { fireEvent, isHiddenFromAccessibility, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { NotificationCard } from './NotificationCard'

type Props = ComponentProps<typeof NotificationCard>

/** « Malik a commenté Météo », en morceaux, comme notifications/present.ts les donne. */
const commented: Props['parts'] = [
  { text: 'Malik', style: 'strong' },
  { text: ' a commenté ' },
  { text: 'Météo', style: 'strong' },
]

/** Une ligne de base : un commentaire de Malik, déjà vu, qui mène quelque part. */
const base: Props = {
  leading: { kind: 'avatar', name: 'Malik', image: null },
  parts: commented,
  when: '20 oct.',
  quote: 'Super idée, je teste ce soir…',
  thumb: { kind: 'project', image: null, title: 'Météo' },
  isNew: false,
  onPress: () => {},
}

/** Toutes les vues du rendu, de la racine aux feuilles. */
type Node = NonNullable<typeof screen.root>
const everyNode = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : everyNode(child))),
]

/** Les couleurs de fond dessinées par le rendu (styles aplatis). */
const backgrounds = (): unknown[] =>
  everyNode(screen.root as Node)
    .map((node) => StyleSheet.flatten(node.props.style)?.backgroundColor)
    .filter((color) => color !== undefined)

describe('NotificationCard', () => {
  it('is a link named by its whole sentence, its quote, its date and « new »', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<NotificationCard {...base} isNew onPress={onPress} />)

    const link = screen.getByRole('link', { name: containing('Malik a commenté Météo') })
    const name = String(link.props.accessibilityLabel ?? link.props['aria-label'])
    expect(name).toMatch(containing('Super idée, je teste ce soir…'))
    expect(name).toMatch(containing('20 oct.'))
    expect(name).toMatch(/Nouveau/)
    await fireEvent.press(link)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says « new » only when it is new', async () => {
    await renderWithProviders(<NotificationCard {...base} />)

    const link = screen.getByRole('link', { name: containing('Malik a commenté Météo') })
    expect(String(link.props.accessibilityLabel ?? '')).not.toMatch(/Nouveau/)
    expect(screen.queryByText('Nouveau', { includeHiddenElements: true })).toBeNull()
  })

  it('adds no full stop after a part that already ends with a sign', async () => {
    await renderWithProviders(<NotificationCard {...base} />)

    // « ce soir… » et non « ce soir…. » : un lecteur d'écran ne lit pas deux ponctuations.
    const link = screen.getByRole('link', { name: containing('Malik a commenté Météo') })
    expect(String(link.props.accessibilityLabel)).not.toMatch(/…\./)
  })

  it('writes its parts as one sentence, the bold parts in texts of their own', async () => {
    await renderWithProviders(<NotificationCard {...base} onPress={null} />)

    // La phrase se lit d'un bloc (une seule traduction) ; les noms et titres y sont imbriqués.
    expect(screen.getByText(containing('Malik a commenté Météo'))).toBeTruthy()
    expect(screen.getByText('Malik')).toBeTruthy()
    expect(screen.getByText('Météo')).toBeTruthy()
  })

  it('writes a version inside the sentence', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        leading={{ kind: 'icon', icon: 'arrows-clockwise', tone: 'neutral' }}
        parts={[
          { text: 'Décollage !', style: 'strong' },
          { text: ' a une mise à jour ' },
          { text: 'v1.2', style: 'version' },
        ]}
        quote={null}
        detail="Un compte à rebours avant chaque question, et 2 autres changements"
        onPress={null}
      />,
    )

    expect(screen.getByText(containing('Décollage ! a une mise à jour v1.2'))).toBeTruthy()
    expect(screen.getByText('v1.2')).toBeTruthy()
    expect(
      screen.getByText('Un compte à rebours avant chaque question, et 2 autres changements'),
    ).toBeTruthy()
  })

  it('shows the quote in a text of its own', async () => {
    await renderWithProviders(<NotificationCard {...base} onPress={null} />)

    expect(screen.getByText('Super idée, je teste ce soir…')).toBeTruthy()
  })

  it('is neither a link nor a button without a destination', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        leading={{ kind: 'icon', icon: 'user-plus', tone: 'neutral' }}
        parts={[{ text: '3 personnes de plus te suivent' }]}
        quote={null}
        thumb={null}
        when="19 oct."
        onPress={null}
      />,
    )

    expect(screen.getByText('3 personnes de plus te suivent')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // Relecture du plan (interface) : le fond miel ne se voit pas d'un lecteur d'écran ; « Nouveau »
  // est caché à l'œil, mais lu, que la ligne soit un bouton ou non.
  it('reads « new » on a new notification that leads nowhere', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        leading={{ kind: 'icon', icon: 'user-plus', tone: 'neutral' }}
        parts={[{ text: '3 personnes de plus te suivent' }]}
        quote={null}
        thumb={null}
        isNew
        onPress={null}
      />,
    )

    const word = screen.getByText('Nouveau', { includeHiddenElements: true })
    expect(isHiddenFromAccessibility(word)).toBe(false)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // Relecture du plan (interface) : la ligne nouvelle est sur `highlightSoft`, jamais `honeySoft`
  // (le couple de couleurs du texte est vérifié dans contrastPairs).
  it('draws a new notification and an open choice row on highlightSoft', async () => {
    const { unmount } = await renderWithProviders(<NotificationCard {...base} isNew />)
    expect(backgrounds()).toContain(palettes.day.highlightSoft)
    expect(backgrounds()).not.toContain(palettes.day.honeySoft)
    await unmount()

    // Témoin : une ligne déjà vue n'a pas ce fond.
    await renderWithProviders(<NotificationCard {...base} />)
    expect(backgrounds()).not.toContain(palettes.day.highlightSoft)
  })

  it('shows the photo of the project on the right', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        thumb={{
          kind: 'project',
          title: 'Météo',
          image: { source: { uri: 'http://localhost:3000/media/meteo.webp' }, label: 'Météo' },
        }}
      />,
    )

    const sources = everyNode(screen.root as Node).map((node) => node.props.source)
    expect(sources).toContainEqual(
      expect.objectContaining({ uri: 'http://localhost:3000/media/meteo.webp' }),
    )
  })

  it('shows the photo of whoever acted on the left', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        leading={{
          kind: 'avatar',
          name: 'Malik',
          image: { uri: 'http://localhost:3000/media/avatars/u4.webp' },
        }}
      />,
    )

    const sources = everyNode(screen.root as Node).map((node) => node.props.source)
    expect(sources).toContainEqual(
      expect.objectContaining({ uri: 'http://localhost:3000/media/avatars/u4.webp' }),
    )
  })

  it('shows the tile of a tool, with its initial', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        leading={{ kind: 'icon', icon: 'sparkle', tone: 'honey' }}
        parts={[
          { text: '« ' },
          { text: 'Glide', style: 'strong' },
          { text: ' » est au catalogue' },
        ]}
        quote={null}
        thumb={{ kind: 'tool', name: 'Glide' }}
        onPress={null}
      />,
    )

    expect(screen.getAllByText('G', { includeHiddenElements: true }).length).toBeGreaterThan(0)
  })

  it('keeps the absolute date of a decision of the moderation (jur-J2)', async () => {
    await renderWithProviders(
      <NotificationCard
        {...base}
        leading={{ kind: 'icon', icon: 'prohibit', tone: 'danger' }}
        when="18 oct."
        onPress={null}
      />,
    )

    expect(screen.getByText('18 oct.')).toBeTruthy()
  })

  it('opens with Enter on the web, like the other cards', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(<NotificationCard {...base} onPress={onPress} />)

      await fireEvent(screen.getByRole('link'), 'keyDown', {
        key: 'Enter',
        repeat: false,
        preventDefault: () => {},
      })
      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
