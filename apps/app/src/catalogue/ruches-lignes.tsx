// La section « Ruches : lignes et invitations » du catalogue (tranche R10, planches R10-Ruches,
// R10-Inviter, R10-Etats) : la ligne d'une ruche (`HiveRow`) et la carte d'une invitation
// (`HiveInvitation`), dans tous leurs états, de jour puis de nuit.
// - Lignes : avec des nouveautés, « rien de neuf », au singulier, sans animateur à montrer, le nom
//   retiré par la modération, un nom de 40 caractères, la forme courte (« Tes ruches ») et la
//   colonne étroite de 320 points.
// - Invitations : reçue (avec son « … »), sans inviteur (compte supprimé), d'une ruche sans nom,
//   refusée, en aperçu (« Ce que reçoit Max », inerte), et à 320 points. « Rejoindre » et
//   « Refuser » y sont vivants : l'écriture dure deux secondes (le bouton tourne, une seconde tape
//   ne fait rien), puis « Refuser » laisse la carte refusée.
// Outil de développement : les exemples sont écrits ici ; les libellés des composants viennent des
// traductions, comme dans l'appli.
import { radii, space } from '@ruche/brand'
import type { HiveSummary, HiveInvitation as Invitation } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { HiveInvitation } from '../ui/HiveInvitation'
import { HiveRow } from '../ui/HiveRow'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Ruches : lignes et invitations',
  intro:
    'La ligne d’une ruche de l’onglet Ruches (un seul lien, lu d’un bloc) et la carte d’une invitation reçue : ses trois promesses, « Rejoindre la ruche », « Refuser », le « … » qui signale la ruche. L’écriture dure ici deux secondes.',
  day: 'jour',
  night: 'nuit',
  rows: 'Lignes : nouveautés, rien de neuf, singulier, sans animateur, nom retiré, nom de 40 caractères',
  compact: 'Forme courte (« Tes ruches » du Fil) : alvéole de 28, nom, nouveautés',
  narrowRows: 'Lignes à 320 points',
  received: 'Invitation reçue, avec son « … » (« Signaler la ruche Atelier IA »)',
  noInviter: 'L’inviteur a supprimé son compte ; pas de « … »',
  unnamed: 'Ruche dont le nom a été retiré par la modération',
  refused: 'Invitation refusée : elle reste à sa place, sans « … »',
  secondary: 'Deuxième invitation de l’écran : « Rejoindre » en blanc (une seule action miel)',
  preview: 'Aperçu (« Ce que reçoit Max ») : boutons dessinés, inertes, sans « … »',
  narrowInvitation: 'Invitation à 320 points',
  reported: 'Signalement demandé (l’écran ouvrirait la feuille « Signaler »).',
  longName: 'Les cousins de la côte atlantique, amis',
}

const en: typeof fr = {
  title: 'Hives: rows and invitations',
  intro:
    'A hive row of the Hives tab (one link, read as a whole) and a received invitation card: its three promises, “Join the hive”, “Decline”, the “…” that reports the hive. Writing takes two seconds here.',
  day: 'day',
  night: 'night',
  rows: 'Rows: news, nothing new, singular, no animator to show, name removed, 40-character name',
  compact: 'Short form (“Your hives” in the Feed): 28-point cell, name, news',
  narrowRows: 'Rows at 320 points',
  received: 'Received invitation, with its “…” (“Report the hive Atelier IA”)',
  noInviter: 'The inviter deleted their account; no “…”',
  unnamed: 'Hive whose name was removed by moderation',
  refused: 'Declined invitation: it stays in place, no “…”',
  secondary: 'Second invitation of the screen: “Join” in white (one honey action only)',
  preview: 'Preview (“What Max receives”): buttons drawn, inert, no “…”',
  narrowInvitation: 'Invitation at 320 points',
  reported: 'Report requested (the screen would open the “Report” sheet).',
  longName: 'The cousins from the Atlantic coast, pals',
}

type Labels = typeof fr

const schemes = ['day', 'night'] as const

/** Une date fixe : les captures ne changent pas d'un passage à l'autre (sauf « il y a »). */
const SENT = '2026-11-14T09:00:00.000Z'

const family: HiveSummary = {
  id: '0f5b8a64-2c1e-4c55-9d1a-6b7e4a3c2d10',
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: 'u-jean', name: 'Papi Jean' },
  faces: [
    { id: 'u-jean', name: 'Papi Jean', avatarUrl: null },
    { id: 'u-lea', name: 'Léa Moreau', avatarUrl: null },
    { id: 'u-odile', name: 'Tante Odile', avatarUrl: null },
    { id: 'u-ines', name: 'Inès Haddad', avatarUrl: null },
  ],
  news: 2,
  role: 'member',
}

const thursday: HiveSummary = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Amis du jeudi',
  icon: 'users-three',
  memberCount: 4,
  animator: { id: 'u-max', name: 'Max Durand' },
  faces: [
    { id: 'u-max', name: 'Max Durand', avatarUrl: null },
    { id: 'u-nora', name: 'Nora Benali', avatarUrl: null },
    { id: 'u-hugo', name: 'Hugo Lefèvre', avatarUrl: null },
  ],
  news: 0,
  role: 'animator',
}

/** Les lignes de l'exemple, dans l'ordre de la légende. */
const rowsOf = (l: Labels): HiveSummary[] => [
  family,
  thursday,
  {
    ...family,
    id: 'single',
    name: 'Atelier photo',
    icon: 'camera',
    memberCount: 1,
    news: 1,
    faces: [],
  },
  { ...thursday, id: 'no-animator', name: 'Club lecture', icon: 'book-open', animator: null },
  { ...family, id: 'unnamed', name: null, icon: 'leaf', news: 12 },
  { ...thursday, id: 'long', name: l.longName, icon: 'music-notes', news: 3 },
]

const invitation: Invitation = {
  id: '6d1c2b8e-9f3a-4b7c-8e21-3a4f5b6c7d80',
  hive: {
    id: 'a3e4f5b6-1c2d-4e8f-9a0b-1c2d3e4f5a6b',
    name: 'Atelier IA',
    icon: 'code',
    memberCount: 6,
    animatorName: 'Nora Benali',
  },
  inviter: { id: 'u-nora', name: 'Nora Benali', avatarUrl: null },
  createdAt: SENT,
}

/** Une écriture qui dure deux secondes : le bouton tourne, la seconde tape ne fait rien. */
const slowly = () => new Promise<void>((resolve) => setTimeout(resolve, 2000))

const noop = () => {}

/** Une invitation vivante : « Refuser » la laisse refusée, « Rejoindre » ne change rien ici. */
function LiveInvitation({
  value,
  onReport,
  mode,
  primary = true,
}: {
  value: Invitation
  onReport?: () => void
  mode?: 'received' | 'preview'
  primary?: boolean
}) {
  const [refused, setRefused] = useState(false)
  return (
    <HiveInvitation
      invitation={value}
      onAccept={slowly}
      onRefuse={() => slowly().then(() => setRefused(true))}
      refused={refused}
      primary={primary}
      {...(onReport ? { onReport } : null)}
      {...(mode ? { mode } : null)}
    />
  )
}

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

/** Des lignes dans leur carte groupée, comme « Mes ruches ». */
function Rows({ hives, compact = false }: { hives: HiveSummary[]; compact?: boolean }) {
  return (
    <Surface variant="grouped" padding="xs">
      {hives.map((hive) => (
        <HiveRow key={hive.id} hive={hive} onPress={noop} compact={compact} />
      ))}
    </Surface>
  )
}

export function HiveRowsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const [reported, setReported] = useState(false)
  const report = () => setReported(true)
  const rows = rowsOf(l)
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {reported ? <Text tone="secondary">{l.reported}</Text> : null}
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.rows} — ${l[scheme]}`}>
              <Rows hives={rows} />
            </Example>
            <Example caption={`${l.compact} — ${l[scheme]}`}>
              <Rows hives={rows.slice(0, 3)} compact />
            </Example>
            <Example caption={`${l.narrowRows} — ${l[scheme]}`} narrow>
              <Rows hives={[family, rows[5] ?? thursday]} />
            </Example>
            <Example caption={`${l.received} — ${l[scheme]}`}>
              <LiveInvitation value={invitation} onReport={report} />
            </Example>
            <Example caption={`${l.noInviter} — ${l[scheme]}`}>
              <LiveInvitation value={{ ...invitation, inviter: null }} />
            </Example>
            <Example caption={`${l.unnamed} — ${l[scheme]}`}>
              <LiveInvitation
                value={{ ...invitation, hive: { ...invitation.hive, name: null } }}
                onReport={report}
              />
            </Example>
            <Example caption={`${l.refused} — ${l[scheme]}`}>
              <HiveInvitation
                invitation={invitation}
                onAccept={slowly}
                onRefuse={slowly}
                onReport={report}
                refused
              />
            </Example>
            <Example caption={`${l.secondary} — ${l[scheme]}`}>
              <LiveInvitation value={invitation} onReport={report} primary={false} />
            </Example>
            <Example caption={`${l.preview} — ${l[scheme]}`}>
              <LiveInvitation
                value={{
                  ...invitation,
                  inviter: { id: 'u-ines', name: 'Inès Haddad', avatarUrl: null },
                  hive: { ...invitation.hive, name: 'Famille', icon: 'house-line', memberCount: 4 },
                }}
                mode="preview"
              />
            </Example>
            <Example caption={`${l.narrowInvitation} — ${l[scheme]}`} narrow>
              <LiveInvitation value={invitation} onReport={report} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
