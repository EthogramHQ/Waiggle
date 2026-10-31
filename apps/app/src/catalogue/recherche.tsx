// Catalogue de la recherche (tranche R3) : le texte surligné (HighlightedText) dans ses cas
// difficiles (un mot, deux mots, un accent, « œ » qui donne deux lettres, un emoji avant le mot,
// aucun mot), puis des lignes de résultats surlignées (ListRow avec `title` et `detail` en nœud),
// comme la planche « R3-Recherche » : un projet, un membre, un outil. Le tout de jour puis de nuit,
// côte à côte, quel que soit le thème du catalogue. Fichier à part de CatalogueScreen.tsx, qui
// l'importe en une ligne. Les textes d'exemple sont écrits ici en clair : le catalogue est un outil
// de développement, absent de l'appli publiée.
import { radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { HighlightedText } from '../ui/HighlightedText'
import { ListGroup, ListRow } from '../ui/ListGroup'
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
        <ListRow
          label="Camille Carnot"
          title={<HighlightedText weight={600} text="Camille Carnot" words={carn} />}
          detail={
            <HighlightedText
              variant="callout"
              tone="muted"
              text="@camille_carnot · 12 abonnés"
              words={carn}
            />
          }
          icon="user-fill"
          trailing="chevron"
          href="/members/camille"
          onPress={noop}
        />
      </ListGroup>
      <ListGroup title="Outils">
        <ListRow
          label="Notion"
          detail={
            <HighlightedText
              variant="callout"
              tone="muted"
              text="Des pages et des carnets partagés · 7 projets publics"
              words={carn}
            />
          }
          icon="wrench-fill"
          href="/tags/notion"
          onPress={noop}
        />
      </ListGroup>
    </Stack>
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
