// La section « Tuiles d'un projet, R10 » du catalogue : ce que `ProjectTile` gagne en R10, dans tous
// ses états, de jour et de nuit, dans une mosaïque de deux colonnes (la largeur d'un téléphone) :
// - la pastille de visibilité (`badge`) : « Privé » (la page « Moi »), « Réservé à Famille » (un
//   projet réservé à une ruche), avec et sans photo, sur les trois teintes ;
// - le menu « … » (`menu`), posé à côté du lien de la tuile, jamais dedans : « Épingler » sur les
//   tuiles d'une ruche, pour l'animateur ; avec photo (le menu se pose sur elle) et sans (sa place
//   est gardée au-dessus du titre), puis avec la pastille en plus ;
// - R12 : la tuile seulement dessinée, sans lien (`onPress` absent), d'un aperçu.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés d'exemple (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais.
import { radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ActionMenu } from '../ui/ActionMenu'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ProjectTile, type TileVariant } from '../ui/Tile'
import { TileMosaic } from '../ui/TileMosaic'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Tuiles d’un projet (R10)',
  intro:
    'La pastille de visibilité au-dessus du titre (« Privé », « Réservé à Famille »), lue après le nom du lien ; le menu « … » en haut à droite, à côté du lien, jamais dedans (« Épingler », pour l’animateur d’une ruche). Le lien reste nommé par le titre.',
  badges: 'Pastilles',
  menus: 'Menu « … »',
  drawn: 'Sans lien, dans un aperçu (R12)',
  status: 'Testable',
  day: 'jour',
  night: 'nuit',
  private: 'Privé',
  reserved: 'Réservé à Famille',
  reservedUnnamed: 'Réservé à Ruche sans nom',
  menu: (title: string) => `Plus d’options pour ${title}`,
  pin: 'Épingler',
  unpin: 'Retirer l’épingle',
  titles: [
    'Le plan de table',
    'Biscotte au parc',
    'Les recettes de Mamie, enfin rangées par saison',
    'Mon herbier de balcon',
  ],
  author: 'Tante Odile',
}

const en: typeof fr = {
  title: 'Project tiles (R10)',
  intro:
    'The visibility pill above the title (“Private”, “Only for Family”), read after the name of the link; the “…” menu at the top right, next to the link, never inside it (“Pin”, for the animator of a hive). The link stays named by the title.',
  badges: 'Pills',
  menus: '“…” menu',
  drawn: 'Without a link, in a preview (R12)',
  status: 'Testable',
  day: 'day',
  night: 'night',
  private: 'Private',
  reserved: 'Only for Family',
  reservedUnnamed: 'Only for Unnamed hive',
  menu: (title: string) => `More options for ${title}`,
  pin: 'Pin',
  unpin: 'Unpin',
  titles: [
    'The seating plan',
    'Biscotte at the park',
    'Grandma’s recipes, finally sorted by season',
    'My balcony herbarium',
  ],
  author: 'Aunt Odile',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const
const variants: TileVariant[] = ['honey', 'cream', 'ink', 'honey']

/** Une photo d'exemple : un aperçu flou (thumbhash, celui de jetons.tsx), le dépôt n'a pas de photo. */
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow

/** Le fond de page du thème choisi, autour des exemples d'un thème (jour ou nuit). */
function Frame({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: 390,
        maxWidth: '100%',
        padding: space.lg,
        borderRadius: radii.group,
        backgroundColor: colors.background,
      }}
    >
      {children}
    </View>
  )
}

/** Les quatre tuiles à pastille : avec et sans photo, sur chaque teinte. */
function BadgeTiles({ l }: { l: Labels }) {
  const badges = [l.private, l.reserved, l.reservedUnnamed, l.reserved]
  return (
    <TileMosaic columns={2}>
      {l.titles.map((title, i) => (
        <ProjectTile
          key={title}
          title={title}
          author={l.author}
          variant={variants[i] ?? 'honey'}
          image={i % 2 === 0 ? { source: null, thumbhash: cafe, label: title } : null}
          badge={badges[i]}
          onPress={noop}
        />
      ))}
    </TileMosaic>
  )
}

/** Les quatre tuiles à menu : avec et sans photo, la dernière avec la pastille en plus. */
function MenuTiles({ l }: { l: Labels }) {
  return (
    <TileMosaic columns={2}>
      {l.titles.map((title, i) => (
        <ProjectTile
          key={title}
          title={title}
          author={l.author}
          variant={variants[i] ?? 'honey'}
          image={i < 2 ? { source: null, thumbhash: cafe, label: title } : null}
          badge={i === 3 ? l.reserved : undefined}
          onPress={noop}
          menu={
            <ActionMenu
              variant="glass"
              align="end"
              label={l.menu(title)}
              items={[{ label: i === 0 ? l.unpin : l.pin, icon: 'push-pin', onPress: noop }]}
            />
          }
        />
      ))}
    </TileMosaic>
  )
}

/**
 * R12 : deux tuiles seulement dessinées, sans `onPress` (l'aperçu « Voir ma page comme un
 * visiteur ») : avec et sans photo, la pastille du statut en plus. Le même cadre, rien à toucher.
 */
function DrawnTiles({ l }: { l: Labels }) {
  return (
    <TileMosaic columns={2}>
      {l.titles.slice(0, 2).map((title, i) => (
        <ProjectTile
          key={title}
          title={title}
          author={l.author}
          image={i === 0 ? { source: null, thumbhash: cafe, label: title } : null}
          badge={l.status}
        />
      ))}
    </TileMosaic>
  )
}

export function ProjectTilesCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // Jour et nuit côte à côte sur un écran large ; l'un sous l'autre ailleurs.
  const wide = useLayout().sizeClass === 'wide'
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Stack direction={wide ? 'row' : 'column'} gap="lg" wrap={wide}>
        {schemes.map((scheme) => (
          <ThemeProvider key={scheme} appearance={scheme}>
            <Frame>
              <Stack gap="md">
                <Text variant="callout" weight={700}>
                  {`${l.badges} — ${l[scheme]}`}
                </Text>
                <BadgeTiles l={l} />
                <Text variant="callout" weight={700}>
                  {`${l.menus} — ${l[scheme]}`}
                </Text>
                <MenuTiles l={l} />
                <Text variant="callout" weight={700}>
                  {`${l.drawn} — ${l[scheme]}`}
                </Text>
                <DrawnTiles l={l} />
              </Stack>
            </Frame>
          </ThemeProvider>
        ))}
      </Stack>
    </Stack>
  )
}
