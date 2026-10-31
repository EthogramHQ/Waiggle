// La section « Explorer : recherche et outils » du catalogue (refonte, tranche R3) : le lien dessiné
// comme un champ de recherche (SearchLink, le haut d'Explorer sur téléphone), la tuile à l'initiale
// d'un outil (InitialTile, en miel et en crème) et les lignes de « Tous les outils » (ListRow avec
// `leading`), dont un nom long. Chaque exemple de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { InitialTile, tileVariantOf } from '../ui/InitialTile'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { SearchLink } from '../ui/SearchLink'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Explorer : recherche et outils',
  intro:
    'Sur téléphone, le haut d’Explorer montre un lien dessiné comme le champ de recherche : le toucher ouvre la page de recherche, où le vrai champ prend le focus. « Tous les outils » range les outils de A à Z, chacun avec sa tuile à l’initiale, décorative, et son nombre de projets publics, lu avec le nom.',
  search: 'Lien vers la recherche',
  tiles: 'Tuiles à l’initiale (miel, crème)',
  rows: 'Lignes de « Tous les outils » (dont un nom long)',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Explore: search and tools',
  intro:
    'On a phone, the top of Explore shows a link drawn like the search field: touching it opens the search page, where the real field takes the focus. “All tools” sorts the tools from A to Z, each with its decorative initial tile and its number of public projects, read with the name.',
  search: 'Link to the search',
  tiles: 'Initial tiles (honey, cream)',
  rows: '“All tools” rows (one with a long name)',
  day: 'day',
  night: 'night',
}

// Des outils et leurs nombres, comme les renverrait GET /v1/tools, rangés de A à Z.
const tools: [string, string, number][] = [
  ['chatgpt', 'ChatGPT', 38],
  ['claude', 'Claude', 41],
  ['ecrivain', 'Écrivain', 1],
  ['home-assistant-voice', 'Home Assistant Voice Preview Edition', 9],
]

const noop = () => {}

export function ToolsCatalogue() {
  const { t, i18n } = useTranslation()
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
            <Example caption={`${l.search} — ${l[scheme]}`}>
              <SearchLink
                label={t(($) => $.search.label)}
                placeholder={t(($) => $.search.placeholder)}
                href="/search"
                onPress={(event) => event?.preventDefault?.()}
              />
            </Example>
            <Example caption={`${l.tiles} — ${l[scheme]}`}>
              <Stack direction="row" gap="md">
                <InitialTile name="Claude" variant="honey" />
                <InitialTile name="cursor" variant="cream" />
                <InitialTile name="Écrivain" variant="honey" />
              </Stack>
            </Example>
            <Example caption={`${l.rows} — ${l[scheme]}`}>
              <ListGroup>
                {tools.map(([slug, label, count]) => {
                  const projects = t(($) => $.tools.projects, { count })
                  return (
                    <ListRow
                      key={slug}
                      label={label}
                      spokenLabel={t(($) => $.tools.withCount, { label, projects })}
                      leading={<InitialTile name={label} variant={tileVariantOf(slug)} />}
                      detail={projects}
                      trailing="chevron"
                      onPress={noop}
                    />
                  )
                })}
              </ListGroup>
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
