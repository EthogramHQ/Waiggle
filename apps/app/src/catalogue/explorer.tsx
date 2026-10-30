// La section « Explorer » du catalogue (refonte, tranche R3) : les pièces de l'onglet Explorer. Le
// carrousel (Carousel) de cartes de testeurs (TesterCard) : avec photo, sans photo, titre long ; le
// carrousel serré des « Outils populaires », des étiquettes avec leur nombre ; et l'étiquette (Tag)
// avec et sans nombre, touchable ou non. Chaque exemple de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Carousel } from '../ui/Carousel'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Tag } from '../ui/Tag'
import { TesterCard } from '../ui/TesterCard'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

// Des résumés flous (ThumbHash) de visuels de projet, les mêmes que ceux de CatalogueScreen. Ils
// ressemblent à des clés secrètes pour l'outil qui cherche les secrets oubliés (gitleaks) : le
// commentaire « gitleaks:allow » lui indique que ce n'en sont pas.
const samples = {
  cafe: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI', // gitleaks:allow
  papillon: 'GdkFJYTHYFSbVnaPWUZndpajf7QG', // gitleaks:allow
}

const fr = {
  title: 'Explorer',
  intro:
    'Les pièces de l’onglet Explorer. Le carrousel défile sous le doigt et s’arrête sur une carte ; sur ordinateur, deux flèches le font défiler d’une page, et elles disparaissent quand tout tient. Il ne bouge jamais seul. « Tester » est un lien vers un site externe, posé sur la photo, hors de tout autre lien.',
  testers: 'Carrousel de cartes de testeurs (avec photo, sans photo, titre long)',
  tools: 'Carrousel serré d’étiquettes avec leur nombre (« Outils populaires »)',
  tags: 'Étiquettes : avec nombre, sans nombre, touchables ou non',
  day: 'jour',
  night: 'nuit',
  photo: 'Photo du projet',
  longTitle: 'Un assistant pour ranger les recettes de mamie par saison, par envie et par placard',
}

const en: typeof fr = {
  title: 'Explore',
  intro:
    'The pieces of the Explore tab. The carousel scrolls under the finger and stops on a card; on a computer, two arrows scroll it by a page, and they disappear when everything fits. It never moves on its own. “Try” is a link to an external site, placed on the photo, outside any other link.',
  testers: 'Carousel of tester cards (with a photo, without, long title)',
  tools: 'Tight carousel of tags with their count (“Popular tools”)',
  tags: 'Tags: with a count, without, tappable or not',
  day: 'day',
  night: 'night',
  photo: 'Photo of the project',
  longTitle: 'An assistant that sorts grandma’s recipes by season, by craving and by cupboard',
}

const noop = () => {}

// Des outils et leurs nombres, comme les renverrait GET /v1/tools (les plus cités d'abord).
const tools: [string, number][] = [
  ['Claude', 41],
  ['ChatGPT', 38],
  ['Lovable', 34],
  ['Python', 22],
  ['Mistral', 12],
  ['Home Assistant', 9],
  ['Glide', 6],
  ['Expo', 1],
]

export function ExploreCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  // Les cartes : une avec photo, une sans (la lumière miel), une au titre long, puis assez d'autres
  // pour que la bande dépasse sur ordinateur (les flèches n'apparaissent qu'alors).
  const cards = [
    { title: 'Quel papillon ?', author: 'Hugo Lefèvre', thumbhash: samples.papillon },
    { title: 'Décollage !', author: 'Papi Jean', thumbhash: null },
    { title: l.longTitle, author: 'Léa Moreau', thumbhash: samples.cafe },
    { title: 'Le journal de Chelsea', author: 'Max Durand', thumbhash: samples.papillon },
    { title: 'Mon agent de recettes', author: 'Nora Benali', thumbhash: null },
    { title: 'Carnet de cafés', author: 'Sam Petit', thumbhash: samples.cafe },
  ]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {schemes.map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.testers} — ${l[scheme]}`}>
              <Carousel
                label={t(($) => $.explore.carousel)}
                previousLabel={t(($) => $.explore.previous)}
                nextLabel={t(($) => $.explore.next)}
                header={
                  <Text variant="heading" heading={3}>
                    {t(($) => $.explore.testers)}
                  </Text>
                }
              >
                {cards.map((card) => (
                  <TesterCard
                    key={card.title}
                    title={card.title}
                    author={card.author}
                    image={
                      card.thumbhash
                        ? { source: null, thumbhash: card.thumbhash, label: l.photo }
                        : null
                    }
                    onTest={noop}
                    onOpen={noop}
                  />
                ))}
              </Carousel>
            </Example>

            <Example caption={`${l.tools} — ${l[scheme]}`}>
              <Carousel
                variant="chips"
                label={t(($) => $.explore.popularTools)}
                previousLabel={t(($) => $.explore.previousTools)}
                nextLabel={t(($) => $.explore.nextTools)}
                header={
                  <Stack direction="row" gap="md" align="center" wrap>
                    <Text variant="heading" heading={3}>
                      {t(($) => $.explore.popularTools)}
                    </Text>
                    <TextLink label={t(($) => $.explore.allTools)} onPress={noop} />
                  </Stack>
                }
              >
                {tools.map(([label, count]) => (
                  <Tag key={label} label={label} count={count} onPress={noop} />
                ))}
              </Carousel>
            </Example>

            <Example caption={`${l.tags} — ${l[scheme]}`}>
              <Stack direction="row" gap="sm" wrap>
                <Tag label="Claude" count={41} onPress={noop} />
                <Tag label="Expo" count={1} onPress={noop} />
                <Tag label="Claude" onPress={noop} />
                <Tag label="Home Assistant" count={9} />
                <Tag label="Python" />
              </Stack>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
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
