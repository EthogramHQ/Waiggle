// La section « La récolte : panneau du niveau, défis et classement » du catalogue (R19, planches
// R19-Profil, R19-Membre, R19-Recolte, R19-Defis et R19-Classement) :
// - le panneau du niveau (HarvestPanel) : le sien avec le titre-lien « Ma récolte › », celui de
//   « Ma récolte » (sans miel ni lien), un niveau nouveau, une série qui hiverne, un nouveau
//   membre, la page d'un proche, un membre sans titre ;
// - la carte d'un défi (ChallengeCard) : neuf, en cours, réussi, titrée ;
// - la liste d'un classement (RankingList) : trois premiers, ex aequo, sa propre ligne, le reste.
// Tout s'affiche de jour puis de nuit, sous un thème imposé. Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne. Les exemples (un outil de développement, absent de l'appli publiée)
// sont écrits ici en français et en anglais ; les textes des composants viennent des vrais textes.
//
// L'alvéole du niveau (`LevelCell`) est un composant voisin, que le panneau reçoit de l'écran
// (`levelCell`) : ici, une alvéole simple dessinée pour l'exemple tient sa place.
import { layout } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { ChallengeCard } from '../ui/ChallengeCard'
import { HarvestPanel } from '../ui/HarvestPanel'
import { RankingList, type RankingRow } from '../ui/RankingList'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La récolte : panneau du niveau, défis et classement',
  intro:
    'Le panneau ne lit aucune donnée : l’écran lui passe ce qu’il montre. Un proche ne voit ni miel, ni phrase de pollen, ni semaines. Chaque ligne du classement est un lien lu d’un trait ; « toi » n’est dit qu’au lecteur d’écran.',
  day: 'jour',
  night: 'nuit',
  panelTitle: 'HarvestPanel : le panneau du niveau',
  panelMine: 'Sa propre page : titre-lien « Ma récolte », miel, phrase de pollen, semaines',
  panelHarvest: '« Ma récolte » : sans miel ni lien',
  panelNew: 'Le niveau vient de monter : « Nouveau »',
  panelHibernating: 'Une série qui hiverne',
  panelNewcomer: 'Un nouveau membre : d’où vient le pollen',
  panelTheirs: 'La page d’un proche (Ambre, Gaufré) : niveau, titre et rayon seulement',
  panelNoTitle: 'Sans titre encore',
  challengeTitle: 'ChallengeCard : la carte d’un défi',
  challengeNew: 'Neuf, le lundi : « Nouveau », jamais « 0 sur 5 »',
  challengeActive: 'En cours : 3 sur 5, le miel promis',
  challengeDone: 'Réussi : le miel gagné',
  challengeTitled: 'Titrée (page d’une ruche, « Défis de mes ruches »)',
  hiveTitle: 'Défi de la semaine',
  rankingTitle: 'RankingList : le classement',
  rankingClose: 'Trois premiers, ex aequo, sa propre ligne (Léa), puis le reste sans rang',
  rankingShort: 'Trois membres seulement',
  title_f: 'Gardienne',
}

const en: typeof fr = {
  title: 'The harvest: level panel, challenges and ranking',
  intro:
    'The panel reads no data: the screen passes what it shows. A close one sees no honey, no pollen sentence, no weeks. Each ranking row is a link read in one go; “you” is said to the screen reader only.',
  day: 'day',
  night: 'night',
  panelTitle: 'HarvestPanel: the level panel',
  panelMine: 'Own page: “My harvest” title link, honey, pollen sentence, weeks',
  panelHarvest: '“My harvest”: no honey, no link',
  panelNew: 'Level just went up: “New”',
  panelHibernating: 'A streak that hibernates',
  panelNewcomer: 'A newcomer: where pollen comes from',
  panelTheirs: 'A close one’s page (Amber, Waffle): level, title and comb only',
  panelNoTitle: 'No title yet',
  challengeTitle: 'ChallengeCard: a challenge card',
  challengeNew: 'New, on Monday: “New”, never “0 of 5”',
  challengeActive: 'In progress: 3 of 5, the promised honey',
  challengeDone: 'Done: the honey earned',
  challengeTitled: 'With a title (hive page, “My hives’ challenges”)',
  hiveTitle: 'Challenge of the week',
  rankingTitle: 'RankingList: the ranking',
  rankingClose: 'Top three, a tie, own row (Léa), then the rest without rank',
  rankingShort: 'Only three members',
  title_f: 'Keeper',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']

/** Un exemple : sa légende, puis l'état. */
function Sample({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Stack>
  )
}

/**
 * Une alvéole d'exemple, à la place de `LevelCell` (que l'écran passe au panneau) : un hexagone
 * miel et son niveau, à la taille d'une alvéole du rayon agrandie. Décor.
 */
function SampleCell({ level }: { level: number }) {
  const { colors } = useTheme()
  const size = layout.comb.cell * 1.5
  const r = size / 2
  const corners = [-90, -30, 30, 90, 150, 210]
    .map((degrees) => {
      const angle = (degrees * Math.PI) / 180
      return `${(r + r * Math.cos(angle)).toFixed(2)} ${(r + r * Math.sin(angle)).toFixed(2)}`
    })
    .join(' L')
  return (
    <View
      aria-hidden
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Path d={`M${corners}Z`} fill={colors.wax} stroke={colors.honey} strokeWidth={3} />
      </Svg>
      <Text variant="headline" tone="onHoney">
        {String(level)}
      </Text>
    </View>
  )
}

// Une ruche de trois membres : la liste s'arrête au troisième, sans place vide ; Malik lit.
const podium: RankingRow[] = [
  { rank: 1, name: 'Malik Benali', avatar: null, pollen: 340, self: true, href: '/members/m' },
  { rank: 2, name: 'Sam Petit', avatar: null, pollen: 120, self: false, href: '/members/s' },
  { rank: 3, name: 'Nora Haddad', avatar: null, pollen: 80, self: false, href: '/members/n' },
]

const ranking: RankingRow[] = [
  { rank: 1, name: 'Malik Benali', avatar: null, pollen: 340, self: false, href: '/members/m' },
  { rank: 2, name: 'Léa Moreau', avatar: null, pollen: 120, self: true, href: '/members/l' },
  { rank: 2, name: 'Sam Petit', avatar: null, pollen: 120, self: false, href: '/members/s' },
  { rank: 4, name: 'Nora Haddad', avatar: null, pollen: 80, self: false, href: '/members/n' },
  { rank: 5, name: 'Inès Durand', avatar: null, pollen: 12, self: false, href: '/members/i' },
]

/** Les exemples d'un thème. */
function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const { t } = useTranslation()
  const feedback = t(($) => $.game.challenges.hive.feedback_5)
  const base = {
    level: 4,
    title: l.title_f,
    cells: 7,
    toNext: 120,
    isNew: false,
    tint: 'honey',
    pattern: 'smooth',
    levelCell: <SampleCell level={4} />,
  } as const

  return (
    <Stack gap="lg">
      <Text variant="headline" heading={3}>
        {`${l.panelTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.panelMine}>
        <HarvestPanel
          {...base}
          honey={35}
          weeks={{ count: 7, hibernating: false }}
          href="/harvest"
        />
      </Sample>
      <Sample caption={l.panelHarvest}>
        <HarvestPanel {...base} weeks={{ count: 7, hibernating: false }} />
      </Sample>
      <Sample caption={l.panelNew}>
        <HarvestPanel
          {...base}
          level={5}
          cells={0}
          toNext={250}
          isNew
          honey={35}
          weeks={{ count: 7, hibernating: false }}
          levelCell={<SampleCell level={5} />}
        />
      </Sample>
      <Sample caption={l.panelHibernating}>
        <HarvestPanel {...base} honey={35} weeks={{ count: 6, hibernating: true }} />
      </Sample>
      <Sample caption={l.panelNewcomer}>
        <HarvestPanel
          {...base}
          level={1}
          title=""
          cells={1}
          toNext={90}
          weeks={{ count: 0, hibernating: false }}
          newcomerHint
          levelCell={<SampleCell level={1} />}
        />
      </Sample>
      <Sample caption={l.panelTheirs}>
        <HarvestPanel
          level={4}
          title={l.title_f}
          cells={7}
          isNew={false}
          tint="amber"
          pattern="waffle"
          theirs
          levelCell={<SampleCell level={4} />}
        />
      </Sample>
      <Sample caption={l.panelNoTitle}>
        <HarvestPanel {...base} title="" honey={5} weeks={{ count: 1, hibernating: false }} />
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.challengeTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.challengeNew}>
        <ChallengeCard label={feedback} progress={0} target={5} state="new" honey={10} />
      </Sample>
      <Sample caption={l.challengeActive}>
        <ChallengeCard
          label={t(($) => $.game.challenges.personal.comment_3)}
          progress={2}
          target={3}
          state="active"
          honey={10}
        />
      </Sample>
      <Sample caption={l.challengeDone}>
        <ChallengeCard label={feedback} progress={5} target={5} state="done" honey={10} />
      </Sample>
      <Sample caption={l.challengeTitled}>
        <ChallengeCard
          title={l.hiveTitle}
          titleLevel={4}
          label={t(($) => $.game.challenges.hive.reactions_10)}
          progress={4}
          target={10}
          state="active"
          honey={10}
        />
      </Sample>

      <Text variant="headline" heading={3}>
        {`${l.rankingTitle} — ${l[scheme]}`}
      </Text>
      <Sample caption={l.rankingClose}>
        <RankingList rows={ranking} />
      </Sample>
      <Sample caption={l.rankingShort}>
        <RankingList rows={podium} />
      </Sample>
    </Stack>
  )
}

export function HarvestPanelsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit. Le fond de page sous les
        // cartes groupées, comme sur « Ma récolte ».
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="plain" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
