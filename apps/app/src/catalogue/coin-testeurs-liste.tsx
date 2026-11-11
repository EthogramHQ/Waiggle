// La section « Liste des testeurs » du catalogue (tranche R7b, planche validée 1) : « 12 testeurs »
// en haut du coin des testeurs, dans tous ses états, de jour et de nuit.
// - Pour un testeur : un simple texte (il ne voit pas les autres testeurs).
// - Pour l'auteur : le bouton replié, puis déplié (les 4 plus récents et « Afficher les 8 autres »,
//   que l'on touche pour voir le reste) ; 5 testeurs (« Afficher l'autre testeur ») ; 3 testeurs
//   seulement (pas de bouton) ; aucun testeur ; et le coin fermé, en lecture seule, sans menu.
// - Dans un cadre de 320 points (le plus petit téléphone), avec un nom long.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes du composant viennent de l'appli.
import { radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Stack } from '../ui/Stack'
import { TestersList, type TestersListItem } from '../ui/TestersList'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Liste des testeurs',
  intro:
    'En haut du coin des testeurs. Pour un testeur, « 12 testeurs » n’est qu’un texte. Pour l’auteur, c’est un bouton qui déplie les 4 testeurs les plus récents, puis « Afficher les 8 autres » ; le menu « … » de chacun propose « Retirer des testeurs ». Coin fermé : la liste se relit, sans menu.',
  tester: 'Pour un testeur : un simple texte',
  collapsed: 'Pour l’auteur, replié',
  expanded: 'Déplié : les 4 plus récents (touche « Afficher les 8 autres »)',
  five: '5 testeurs : « Afficher l’autre testeur »',
  three: '3 testeurs seulement : pas de bouton',
  none: 'Aucun testeur',
  closed: 'Coin fermé, lecture seule : sans menu',
  narrow: 'Nom long, sur 320 points',
  longName: 'Marie-Christine Dupont-Lefèvre de la Roche',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Testers list',
  intro:
    'At the top of the testers corner. For a tester, “12 testers” is plain text. For the author, it is a button that unfolds the 4 most recent testers, then “Show the 8 others”; the “…” menu of each offers “Remove from testers”. Closed corner: the list reads, without a menu.',
  tester: 'For a tester: plain text',
  collapsed: 'For the author, folded',
  expanded: 'Unfolded: the 4 most recent (press “Show the 8 others”)',
  five: '5 testers: “Show the other tester”',
  three: 'Only 3 testers: no button',
  none: 'No tester',
  closed: 'Closed corner, read only: no menu',
  narrow: 'Long name, at 320 points',
  longName: 'Marie-Christine Dupont-Lefèvre de la Roche',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

const NAMES = [
  'Inès Haddad',
  'Léa Moreau',
  'Hugo Lefèvre',
  'Tante Odile',
  'Nora Benali',
  'Max Durand',
  'Lina Costa',
  'Yanis Roux',
  'Chloé Faure',
  'Théo Garnier',
  'Emma Lopez',
  'Paul Vidal',
]
/**
 * Douze testeurs, du plus récent inscrit au plus ancien (l'ordre de l'API). Sans photo : les
 * initiales. `Avatar` dessine une photo avec l'`Image` de React Native, qui ne dessine pas sur le web
 * une image SVG écrite dans l'adresse (`data:`), la seule que le catalogue puisse fabriquer : on n'y
 * verrait qu'un rond vide.
 */
const twelve: TestersListItem[] = NAMES.map((name, index) => ({
  id: `t${index + 1}`,
  name,
  avatar: null,
  since: new Date(Date.UTC(2026, 10, 3 - index * 3, 9)).toISOString(),
}))

/** Un exemple légendé, sur le fond de la page du coin (jour ou nuit), à 390 ou 320 points. */
function Example({
  caption,
  narrow = false,
  children,
}: {
  caption: string
  narrow?: boolean
  children: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <Stack gap="xs">
      <View
        style={{
          width: narrow ? 320 : 390,
          maxWidth: '100%',
          padding: space.lg,
          borderRadius: radii.group,
          backgroundColor: colors.background,
        }}
      >
        {children}
      </View>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

export function TestersListCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const longOne: TestersListItem[] = [
    { id: 'long', name: l.longName, avatar: null, since: '2026-10-20T09:00:00.000Z' },
    ...twelve.slice(0, 2),
  ]
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.tester} — ${l[scheme]}`}>
              <TestersList count={12} testers={null} />
            </Example>
            <Example caption={`${l.collapsed} — ${l[scheme]}`}>
              <TestersList count={12} testers={twelve} onRemove={noop} />
            </Example>
            <Example caption={`${l.expanded} — ${l[scheme]}`}>
              <TestersList count={12} testers={twelve} onRemove={noop} initiallyOpen />
            </Example>
            <Example caption={`${l.five} — ${l[scheme]}`}>
              <TestersList count={5} testers={twelve.slice(0, 5)} onRemove={noop} initiallyOpen />
            </Example>
            <Example caption={`${l.three} — ${l[scheme]}`}>
              <TestersList count={3} testers={twelve.slice(0, 3)} onRemove={noop} initiallyOpen />
            </Example>
            <Example caption={`${l.none} — ${l[scheme]}`}>
              <TestersList count={0} testers={[]} onRemove={noop} initiallyOpen />
            </Example>
            <Example caption={`${l.closed} — ${l[scheme]}`}>
              <TestersList count={12} testers={twelve} initiallyOpen />
            </Example>
            <Example caption={`${l.narrow} — ${l[scheme]}`} narrow>
              <TestersList count={3} testers={longOne} onRemove={noop} initiallyOpen />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
