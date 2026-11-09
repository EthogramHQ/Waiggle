// La section « Catégorie, abonnés et liste vide » du catalogue (relectures de R6b, interface C7 et
// S4, design C4) : la ligne de catégorie d'un projet, en texte simple puis en lien (vers Explorer
// filtré, avec sa vraie adresse sur le web), et un long nom dans une colonne étroite, qui passe à la
// ligne ; le nombre d'abonnés seul, puis à la place d'un bouton, centré sur son voisin (projet retiré,
// compte suspendu) ; une liste de projets vide avec son issue (« Voir tous les projets »). Chaque
// exemple de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses libellés (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais ; les
// textes des composants viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { CategoryLine } from '../ui/CategoryLine'
import { FollowerCount } from '../ui/FollowerCount'
import { ProjectGrid } from '../ui/ProjectGrid'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Catégorie, abonnés et liste vide',
  intro:
    'En haut de la page d’un projet, sa catégorie : un texte discret, ou un lien vers Explorer filtré sur elle (une vraie adresse sur le web). Un long nom passe à la ligne. Le nombre d’abonnés se pose seul, ou à la place d’un bouton, à la hauteur de son voisin. Une liste vide dit pourquoi, et propose une issue.',
  plain: 'Catégorie en texte simple',
  link: 'Catégorie en lien (vers /explore?category=science)',
  long: 'Catégorie au long nom, dans une colonne étroite (320 px, texte agrandi)',
  count: 'Abonnés : seuls, puis à la place d’un bouton, à côté de « Tester la démo »',
  empty: 'Liste vide d’une catégorie, avec son issue',
  science: 'Sciences et espace · Apprendre',
  longName: 'Électronique, objets connectés et bricolage · Maison et jardin',
  followers: '12 abonnés',
  demo: 'Tester la démo',
  emptyMessage: 'Aucun projet dans « Voyages » pour l’instant.',
  seeAll: 'Voir tous les projets',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Category, followers and empty list',
  intro:
    'At the top of a project page, its category: discreet text, or a link to Explore filtered on it (a real address on the web). A long name wraps. The follower count stands alone, or in place of a button, at the height of its neighbour. An empty list says why, and offers a way out.',
  plain: 'Category as plain text',
  link: 'Category as a link (to /explore?category=science)',
  long: 'Category with a long name, in a narrow column (320 px, larger text)',
  count: 'Followers: alone, then in place of a button, beside “Try the demo”',
  empty: 'Empty list of a category, with its way out',
  science: 'Science and space · Learning',
  longName: 'Electronics, connected objects and tinkering · Home and garden',
  followers: '12 followers',
  demo: 'Try the demo',
  emptyMessage: 'No project in “Travel” yet.',
  seeAll: 'See all projects',
  day: 'day',
  night: 'night',
}

const noop = () => {}

export function ProjectCategoryCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.plain} — ${l[scheme]}`}>
              <CategoryLine label={l.science} icon="planet" />
            </Example>
            <Example caption={`${l.link} — ${l[scheme]}`}>
              <CategoryLine
                label={l.science}
                icon="planet"
                href="/explore?category=science"
                onPress={noop}
              />
            </Example>
            <Example caption={`${l.long} — ${l[scheme]}`}>
              {/* La largeur d'une colonne de téléphone étroit, texte agrandi. */}
              <View style={{ width: 200, maxWidth: '100%' }}>
                <CategoryLine
                  label={l.longName}
                  icon="robot"
                  href="/explore?category=electronics"
                  onPress={noop}
                />
              </View>
            </Example>
            <Example caption={`${l.count} — ${l[scheme]}`}>
              <FollowerCount text={l.followers} />
              <Stack direction="row" gap="md" wrap>
                <Button label={l.demo} onPress={noop} />
                <FollowerCount text={l.followers} inButtonRow />
              </Stack>
            </Example>
            <Example caption={`${l.empty} — ${l[scheme]}`}>
              <ProjectGrid empty={l.emptyMessage} emptyAction={{ label: l.seeAll, onPress: noop }}>
                {[]}
              </ProjectGrid>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
