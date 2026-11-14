// La section « Ruches : actualité et membres » du catalogue (tranche R10, planches R10-Ruche,
// R10-Ruche-Nuit, R10-Ruche-Desktop et R10-Membres), dans tous ses états, de jour et de nuit :
// - les lignes de l'actualité d'une ruche (`HiveActivityRow`) : publié et réservé à la ruche, mis à
//   jour avec et sans version, épinglé ; réservé à une ruche dont le nom a été retiré ; un titre
//   long sur 320 points ;
// - la liste des membres (`HiveMemberList`) : vue par un membre (sans « Retirer »), vue par
//   l'animateur (« Retirer » sur chaque autre membre), avec un membre réduit (il a bloqué
//   l'animateur : son nom seul), un nom long sur 320 points.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { radii, space } from '@ruche/brand'
import type { HiveActivityItem, HiveMember } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { projectWithPhotos, summaryOf } from '../testing/projects'
import { HiveActivityRow } from '../ui/HiveActivityRow'
import { HiveMemberList } from '../ui/HiveMemberList'
import { ListGroup } from '../ui/ListGroup'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Ruches : actualité et membres',
  intro:
    'L’actualité d’une ruche : chaque ligne est un seul lien vers le projet, lu en entier (la phrase, « Réservé à Famille », la date). Les membres : le nom mène à leur page ; chez l’animateur, « Retirer … de la ruche » suit chaque autre membre. Un membre qui a bloqué l’animateur se montre par son nom seul.',
  activity: 'Actualité de la ruche Famille',
  activityUnnamed: 'Réservé à une ruche dont le nom a été retiré',
  activityNarrow: 'Titre long, sur 320 points',
  members: 'Membres, vus par Inès (un membre)',
  membersAnimator: 'Membres, vus par Papi Jean (l’animateur) : « Retirer »',
  membersReduced: 'Chez l’animateur, Max l’a bloqué : son nom seul, « Retirer » quand même',
  membersNarrow: 'Nom long, sur 320 points, chez l’animateur',
  longTitle: 'Le grand livre des recettes de la famille Dupont-Lefèvre, tome deux',
  longName: 'Marie-Christine Dupont-Lefèvre de la Roche',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Hives: news and members',
  intro:
    'A hive’s news: each line is a single link to the project, read whole (the sentence, “Kept for Family”, the date). Members: the name leads to their page; for the animator, “Remove … from the hive” follows every other member. A member who blocked the animator shows by name only.',
  activity: 'News of the Family hive',
  activityUnnamed: 'Reserved to a hive whose name was removed',
  activityNarrow: 'Long title, at 320 points',
  members: 'Members, seen by Inès (a member)',
  membersAnimator: 'Members, seen by Papi Jean (the animator): “Remove”',
  membersReduced: 'For the animator, Max blocked him: name only, “Remove” still there',
  membersNarrow: 'Long name, at 320 points, for the animator',
  longTitle: 'The big recipe book of the Dupont-Lefèvre family, volume two',
  longName: 'Marie-Christine Dupont-Lefèvre de la Roche',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/** L'heure figée du catalogue : les dates relatives ne changent pas d'une capture à l'autre. */
const NOW = new Date('2026-11-14T18:00:00.000Z')

/** Des résumés flous de photo (pas de vraie image dans le catalogue : voir coin-testeurs-liste). */
const THUMBHASH = {
  cafe: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI', // gitleaks:allow (un résumé d'image, pas une clé)
  papillon: 'GdkFJYTHYFSbVnaPWUZndpajf7QG', // gitleaks:allow (un résumé d'image, pas une clé)
}

/** Un projet du catalogue, en version courte, avec un titre et une photo floue à lui. */
const project = (title: string, thumbhash: string | null) => {
  const summary = summaryOf(projectWithPhotos)
  return {
    ...summary,
    title,
    cover: thumbhash && summary.cover ? { ...summary.cover, thumbhash } : null,
  }
}

const face = (id: string, name: string) => ({ id, name, avatarUrl: null })

/** L'actualité de la planche R10-Ruche-Desktop : publié (réservé), mis à jour · v2, épinglé. */
const news = (longTitle: string): HiveActivityItem[] => [
  {
    kind: 'published',
    actor: face('u-lea', 'Léa'),
    project: project('Le plan de table', THUMBHASH.cafe),
    version: null,
    at: '2026-11-13T19:00:00.000Z',
    reserved: true,
  },
  {
    kind: 'updated',
    actor: face('u-odile', 'Tante Odile'),
    project: project('Biscotte au parc', THUMBHASH.papillon),
    version: 'v2',
    at: '2026-11-10T09:00:00.000Z',
    reserved: false,
  },
  {
    kind: 'updated',
    actor: face('u-ines', 'Inès Haddad'),
    project: project('Carnet de cafés', null),
    version: null,
    at: '2026-11-14T17:48:00.000Z',
    reserved: false,
  },
  {
    kind: 'pinned',
    actor: face('u-jean', 'Papi Jean'),
    project: project(longTitle === '' ? 'Décollage !' : longTitle, THUMBHASH.cafe),
    version: null,
    at: '2026-11-09T10:00:00.000Z',
    reserved: true,
  },
]

const member = (
  id: string,
  name: string,
  handle: string | null,
  extra: Partial<HiveMember> = {},
): HiveMember => ({
  face: face(id, name),
  handle,
  role: 'member',
  isMe: false,
  reduced: false,
  ...extra,
})

/** La ruche « Famille » de la planche R10-Membres, l'animateur d'abord. */
const family = (me: 'u-jean' | 'u-ines'): HiveMember[] => [
  member('u-jean', 'Papi Jean', 'papi_jean', { role: 'animator', isMe: me === 'u-jean' }),
  member('u-lea', 'Léa Moreau', 'lea_moreau'),
  member('u-odile', 'Tante Odile', 'tante_odile'),
  member('u-ines', 'Inès Haddad', 'ines_h', { isMe: me === 'u-ines' }),
]

/** Un exemple légendé, sur le fond de la page (jour ou nuit), à 390 ou 320 points. */
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

/** Des lignes d'actualité dans leur carte blanche, comme sur la page de la ruche. */
function NewsList({ items, hiveName }: { items: HiveActivityItem[]; hiveName: string | null }) {
  return (
    <ListGroup list>
      {items.map((item) => (
        <HiveActivityRow
          key={`${item.kind}-${item.project.title}`}
          item={item}
          hiveName={hiveName}
          onPress={noop}
          now={NOW}
        />
      ))}
    </ListGroup>
  )
}

export function HiveNewsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const reduced = member('u-max', 'Max Durand', null, { reduced: true })
  const longOne = member('u-long', l.longName, 'marie_christine')
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
            <Example caption={`${l.activity} — ${l[scheme]}`}>
              <NewsList items={news('')} hiveName="Famille" />
            </Example>
            <Example caption={`${l.activityUnnamed} — ${l[scheme]}`}>
              <NewsList items={news('').slice(0, 1)} hiveName={null} />
            </Example>
            <Example caption={`${l.activityNarrow} — ${l[scheme]}`} narrow>
              <NewsList items={news(l.longTitle).slice(3)} hiveName="Famille" />
            </Example>
            <Example caption={`${l.members} — ${l[scheme]}`}>
              <HiveMemberList
                members={family('u-ines')}
                canRemove={false}
                onOpen={noop}
                onRemove={noop}
              />
            </Example>
            <Example caption={`${l.membersAnimator} — ${l[scheme]}`}>
              <HiveMemberList members={family('u-jean')} canRemove onOpen={noop} onRemove={noop} />
            </Example>
            <Example caption={`${l.membersReduced} — ${l[scheme]}`}>
              <HiveMemberList
                members={[...family('u-jean').slice(0, 2), reduced]}
                canRemove
                onOpen={noop}
                onRemove={noop}
              />
            </Example>
            <Example caption={`${l.membersNarrow} — ${l[scheme]}`} narrow>
              <HiveMemberList
                members={[family('u-jean')[0] ?? longOne, longOne]}
                canRemove
                onOpen={noop}
                onRemove={noop}
              />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
