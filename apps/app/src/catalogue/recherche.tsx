// Catalogue de la recherche (tranche R3) : le texte surligné (HighlightedText) dans ses cas
// difficiles (un mot, deux mots, un accent, « œ » qui donne deux lettres, un emoji avant le mot,
// aucun mot), puis des lignes de résultats surlignées (ListRow avec `title` et `detail` en nœud),
// comme la planche « R3-Recherche » : des projets, des membres (photo ou initiales), des outils (tuile
// à l'initiale), et la ligne d'état annoncée (LiveStatus). Le tout de jour puis de nuit,
// côte à côte, quel que soit le thème du catalogue. Fichier à part de CatalogueScreen.tsx, qui
// l'importe en une ligne. Les textes d'exemple sont écrits ici en clair : le catalogue est un outil
// de développement, absent de l'appli publiée.
import { radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Avatar } from '../ui/Avatar'
import { HighlightedText } from '../ui/HighlightedText'
import { InitialTile } from '../ui/InitialTile'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const noop = () => {}

/** Les cas du texte surligné : ce qui est tapé, et le texte où on le cherche. */
const samples: readonly { caption: string; text: string; words: string[] }[] = [
  { caption: 'Un mot (« carn »)', text: 'Carnet de cafés', words: ['carn'] },
  {
    caption: 'Deux mots, partout où ils paraissent (« carn cafe »)',
    text: 'Carnet de cafés, le café du matin',
    words: ['carn', 'cafe'],
  },
  {
    caption: 'Un accent (« eleve » trouve « Élève »)',
    text: 'Mon Élève préféré',
    words: ['eleve'],
  },
  { caption: '« œ » replié en deux lettres (« oeu »)', text: 'Œuvre du matin', words: ['oeu'] },
  { caption: 'Un emoji avant le mot (« ot »)', text: '🐝 Notion pour les ruches', words: ['ot'] },
  { caption: 'Aucun mot : le texte tel quel', text: 'Carnet de cafés', words: [] },
]

/** Les mots de la planche : « carn » tapé dans le champ. */
const carn = ['carn']

export function SearchCatalogue() {
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        Recherche (R3)
      </Text>
      <Text tone="secondary">
        Le surlignage miel des mots trouvés : l’encre sur le miel, même dans une ligne grise. Le
        texte reste lu d’un tenant ; le surlignage n’est qu’un indice pour l’œil.
      </Text>
      {(['day', 'night'] as const).map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit côte à côte (ce ThemeProvider-là
        // ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Backdrop>
            <Stack gap="md">
              <Text variant="callout" weight={700}>
                {scheme === 'day' ? 'Jour' : 'Nuit'}
              </Text>
              {samples.map(({ caption, text, words }) => (
                <Stack key={caption} gap="xxs">
                  <Text variant="caption" tone="muted">
                    {caption}
                  </Text>
                  <HighlightedText text={text} words={words} />
                </Stack>
              ))}
              <Text variant="caption" tone="muted">
                Une précision grise surlignée (callout, muted)
              </Text>
              <HighlightedText
                variant="callout"
                tone="muted"
                text="@camille_carnot · 12 abonnés"
                words={carn}
              />
              <Results />
              <StatusLines />
            </Stack>
          </Backdrop>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Les résultats de la planche pour « carn » : des lignes dont le titre et la précision sont surlignés. */
function Results() {
  return (
    <Stack gap="md">
      <ListGroup title="Projets">
        <ListRow
          label="Carnet de cafés"
          title={<HighlightedText weight={600} text="Carnet de cafés" words={carn} />}
          detail="Léa Moreau · Cuisine"
          icon="rocket-launch"
          href="/projects/p1"
          onPress={noop}
        />
        <ListRow
          label="Biscotte au parc"
          title={<HighlightedText weight={600} text="Biscotte au parc" words={carn} />}
          detail={
            <HighlightedText
              variant="callout"
              tone="muted"
              numberOfLines={2}
              text="« Le carnet de balades de Biscotte, chien de parc et de plage… »"
              words={carn}
            />
          }
          icon="rocket-launch"
          href="/projects/p2"
          onPress={noop}
        />
      </ListGroup>
      <ListGroup title="Membres">
        {/* Sans photo : les initiales sur le miel (Avatar), comme la page de recherche. */}
        <ListRow
          label="Camille Carnot"
          leading={<Avatar name="Camille Carnot" source={null} label="" size={40} />}
          title={<HighlightedText weight={600} text="Camille Carnot" words={carn} />}
          detail={
            <HighlightedText
              variant="callout"
              tone="muted"
              text="@camille_carnot · 12 abonnés"
              words={carn}
            />
          }
          trailing="chevron"
          href="/members/camille"
          onPress={noop}
        />
        <ListRow
          label="Inès Carnelle"
          leading={<Avatar name="Inès Carnelle" source={null} label="" size={40} />}
          title={<HighlightedText weight={600} text="Inès Carnelle" words={carn} />}
          detail={
            <HighlightedText variant="callout" tone="muted" text="@ines · 1 abonné" words={carn} />
          }
          trailing="chevron"
          href="/members/ines"
          onPress={noop}
        />
      </ListGroup>
      <ListGroup title="Outils">
        {/* La tuile à l'initiale, en miel et en crème, comme « Tous les outils ». */}
        <ListRow
          label="Carnivore AI"
          leading={<InitialTile name="Carnivore AI" variant="honey" />}
          title={<HighlightedText weight={600} text="Carnivore AI" words={carn} />}
          detail="7 projets publics"
          trailing="chevron"
          href="/tags/carnivore-ai"
          onPress={noop}
        />
        <ListRow
          label="Notion"
          leading={<InitialTile name="Notion" variant="cream" />}
          detail={
            <HighlightedText
              variant="callout"
              tone="muted"
              text="Des pages et des carnets partagés · 7 projets publics"
              words={carn}
            />
          }
          trailing="chevron"
          href="/tags/notion"
          onPress={noop}
        />
      </ListGroup>
    </Stack>
  )
}

/**
 * La ligne d'état de la recherche (LiveStatus), dans ses trois états : un texte montré et lu, vide
 * (toujours là, sans place prise), et lu sans être montré (« Aucun résultat » le dit déjà à l'œil).
 * Un cadre pointillé autour de chacune : on voit la place qu'elle prend.
 */
function StatusLines() {
  return (
    <Stack gap="md">
      <Text variant="callout" weight={700}>
        La ligne d’état (LiveStatus)
      </Text>
      {(
        [
          ['Montrée et lue', '3 projets, 1 membre, 0 outil', true],
          ['Vide : toujours montée, sans place prise', '', true],
          ['Lue sans être montrée (rien trouvé)', '0 projet, 0 membre, 0 outil', false],
        ] as const
      ).map(([caption, message, visible]) => (
        <Stack key={caption} gap="xxs">
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
          <Frame>
            <LiveStatus message={message} visible={visible} />
          </Frame>
        </Stack>
      ))}
    </Stack>
  )
}

/** Un cadre pointillé, pour voir la place que prend un exemple (aucune, s'il est caché). */
function Frame({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.dashed,
        borderRadius: radii.small,
        padding: space.xs,
        minHeight: space.lg,
      }}
    >
      {children}
    </View>
  )
}

/** Le fond de page du thème imposé (la Cire, la Nuit), pour voir le miel là où il vit. */
function Backdrop({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{ backgroundColor: colors.background, borderRadius: radii.tile, padding: space.lg }}
    >
      {children}
    </View>
  )
}
