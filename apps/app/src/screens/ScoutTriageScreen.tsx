// La page de tri des Éclaireuses (tranche R20, « /moderation/scouts » ; scénario
// docs/scenarios/refonte.md, « La page de tri (l'administrateur) » ; planches R20-Tri,
// R20-Tri-Telephone, R20-Corrige, R20-Missions-Admin), réservée à l'administrateur :
// - en tête, trois tuiles : le mois (« Pas lancé » et « Lancer le mois », confirmé, puis « Jour 12
//   sur 30 », puis « Fini le … »), les places (« 18 sur 30 ») et les missions de la semaine, qu'on
//   écrit ou modifie dans une fenêtre (`MissionsEditor`) ;
// - l'onglet « Retours » : la liste, filtrée par statut, sorte et gravité (des menus, `MenuField`),
//   les plus récents d'abord ; un retour touché s'ouvre à côté sur ordinateur, à la place de la
//   liste sur téléphone (`ReportDetail`). Ouvrir un retour ne le marque pas « Lu » ;
// - l'onglet « Éclaireuses » : chacune, son nombre de retours, et « Retirer » (`ScoutList`).
//
// Pour tout autre membre, la page n'existe pas (« Page introuvable »), comme `/moderation` : l'appli
// lit `me.isAdmin`, rien n'est demandé, et l'API, qui refait la vérification à chaque demande,
// répond 404.
import {
  SCOUT_PLACES,
  SCOUT_PROGRAM_DAYS,
  type ScoutReportKind,
  type ScoutSeverity,
  type ScoutStatus,
  type ScoutTriage,
} from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import {
  type ScoutReportFilters,
  useLaunchScoutProgram,
  useScoutReports,
  useScoutTriage,
} from '../moderation/scouts/api'
import { kindIcon, statusLook } from '../moderation/scouts/look'
import { MissionsEditor } from '../moderation/scouts/MissionsEditor'
import { ReportDetail } from '../moderation/scouts/ReportDetail'
import { ScoutList } from '../moderation/scouts/ScoutList'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { Dialog } from '../ui/Dialog'
import { FeedEnd } from '../ui/FeedEnd'
import { GaugeTile } from '../ui/GaugeTile'
import { MenuField } from '../ui/MenuField'
import { parisDaysBetween, shortDate } from '../ui/relativeDate'
import { ScoutTriageRow } from '../ui/ScoutTriageRow'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { TabPanel, Tabs } from '../ui/Tabs'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { LoadErrorScreen, LoadingScreen, NotFoundState, SignedOutScreen } from './states'

type Tab = 'reports' | 'scouts'
/** Un filtre de la liste : une valeur, ou « Tous » (`all`). */
type Choice<T extends string> = T | 'all'

/** R16 : la garde de session commune (accounts/SessionGate.tsx), comme les autres pages de la Modération. */
export function ScoutTriageScreen() {
  return (
    <SessionGate loading={<LoadingScreen shape="list" width="page" />}>
      {() => <ScoutTriagePage />}
    </SessionGate>
  )
}

function ScoutTriagePage() {
  const { t } = useTranslation()
  const me = useMe()
  if (!me.data) {
    if (me.isError) return <LoadErrorScreen error={me.error} onRetry={() => void me.refetch()} />
    return <LoadingScreen shape="list" width="page" />
  }
  // Un membre qui n'est pas administrateur : la page n'existe pas pour lui, rien n'est demandé.
  if (!me.data.isAdmin) return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  return <AdminScoutTriage />
}

/** Le jour d'une date du calendrier (« 2026-11-23 ») à midi UTC : le même jour à Paris. */
const noonOf = (day: string, plusDays = 0) => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + plusDays, 12))
}

function AdminScoutTriage() {
  const { t, i18n } = useTranslation()
  const back = useGoBack('/moderation')
  const { columns } = useLayout()
  const sources = useMediaSources()
  const top = useScoutTriage()
  const [filters, setFilters] = useState<ScoutReportFilters>({})
  const reports = useScoutReports(filters)
  const [tab, setTab] = useState<Tab>('reports')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const launch = useLaunchScoutProgram()

  // Les refus qui changent toute la page (un administrateur révoqué : l'API ne connaît plus la page).
  const fatal = !top.data && top.isError ? errorKey(top.error) : null
  if (fatal === 'notFound') return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
  if (fatal === 'unauthorized') return <SignedOutScreen expired />
  if (!top.data) {
    if (top.isError) return <LoadErrorScreen error={top.error} onRetry={() => void top.refetch()} />
    return <LoadingScreen shape="list" width="page" />
  }
  const triage = top.data

  const list = reports.data?.pages.flatMap((page) => page.reports) ?? []
  // Sur ordinateur, le premier retour s'ouvre à côté de la liste tant qu'aucun n'est choisi.
  const selected =
    list.find((report) => report.id === selectedId) ?? (columns ? list[0] : undefined)
  const phoneDetail = !columns && tab === 'reports' && selected !== undefined
  const totalReports = triage.scouts.reduce((sum, scout) => sum + scout.reports, 0)

  const filter = <K extends keyof ScoutReportFilters>(key: K, value: string) =>
    setFilters((current) => {
      const next = { ...current }
      if (value === 'all') delete next[key]
      else next[key] = value as ScoutReportFilters[K]
      return next
    })
  const filtered = Object.keys(filters).length > 0
  const all = { value: 'all' as const, label: t(($) => $.scout.triage.filterAll) }

  const head = (
    // Les trois tuiles côte à côte quand la page a ses colonnes ; sur téléphone, l'une sous l'autre :
    // en rangée, chacune n'avait plus qu'un tiers de 390 points, et « Lancer le mois » s'écrivait
    // une lettre par ligne (capture tri-avant, 26/11/2026).
    <Stack direction={columns ? 'row' : 'column'} wrap={columns} gap="md" align="stretch">
      <Stack grow={columns}>
        <MonthTile
          program={triage.program}
          onLaunch={() => {
            if (!launch.isPending) setLaunchOpen(true)
          }}
        />
      </Stack>
      <Stack grow={columns}>
        <GaugeTile
          label={t(($) => $.scout.triage.places)}
          value={t(($) => $.scout.triage.placesValue, {
            count: triage.places.taken,
            total: SCOUT_PLACES,
          })}
          ratio={triage.places.taken / SCOUT_PLACES}
        />
      </Stack>
      <Stack grow={columns}>
        <GaugeTile
          label={t(($) => $.scout.triage.missions)}
          trailing={
            <Button
              label={
                triage.missions.length > 0
                  ? t(($) => $.scout.triage.editMissions)
                  : t(($) => $.scout.triage.writeMissions)
              }
              icon={triage.missions.length > 0 ? 'pencil-simple' : 'plus'}
              variant="secondary"
              size="compact"
              onPress={() => setEditorOpen(true)}
            />
          }
        >
          {triage.missions.length === 0 ? (
            <Text variant="callout" tone="muted">
              {t(($) => $.scout.triage.noMission)}
            </Text>
          ) : (
            <Stack gap="xs" accessibilityRole="list">
              {triage.missions.map((mission) => (
                <Text key={mission.id} variant="callout">
                  {mission.textFr}
                </Text>
              ))}
            </Stack>
          )}
        </GaugeTile>
      </Stack>
    </Stack>
  )

  const filterBar = (
    <Stack direction="row" wrap gap="sm">
      <MenuField<Choice<ScoutStatus>>
        label={t(($) => $.scout.triage.filterStatus)}
        value={filters.status ?? 'all'}
        placeholder={all.label}
        options={[
          all,
          ...(['sent', 'read', 'planned', 'fixed', 'parked'] as const).map((value) => ({
            value,
            label: statusLook(t, value).label,
          })),
        ]}
        onChange={(value) => filter('status', value)}
      />
      <MenuField<Choice<ScoutReportKind>>
        label={t(($) => $.scout.triage.filterKind)}
        value={filters.kind ?? 'all'}
        placeholder={all.label}
        options={[
          all,
          ...(['bug', 'confusing', 'idea', 'love'] as const).map((value) => ({
            value,
            label: t(($) => $.scout.kinds[value]),
          })),
        ]}
        onChange={(value) => filter('kind', value)}
      />
      <MenuField<Choice<ScoutSeverity>>
        label={t(($) => $.scout.triage.filterSeverity)}
        value={filters.severity ?? 'all'}
        placeholder={all.label}
        options={[
          all,
          ...(['minor', 'annoying', 'blocking'] as const).map((value) => ({
            value,
            label: t(($) => $.scout.severities[value]),
          })),
        ]}
        onChange={(value) => filter('severity', value)}
      />
    </Stack>
  )

  const reportList =
    reports.isError && !reports.data ? (
      <StateMessage
        kind="error"
        level={2}
        title={t(($) => $.moderation.errorTitle)}
        message={t(($) => $.errors[errorKey(reports.error)])}
        actions={[
          {
            label: t(($) => $.common.retry),
            onPress: () => void reports.refetch({ cancelRefetch: false }),
            loading: reports.isFetching,
          },
        ]}
      />
    ) : !reports.data ? (
      <StateMessage kind="loading" message={t(($) => $.common.loading)} />
    ) : list.length === 0 ? (
      <StateMessage
        kind="empty"
        message={filtered ? t(($) => $.scout.triage.noMatch) : t(($) => $.scout.triage.empty)}
      />
    ) : (
      <Stack gap="md">
        <Stack gap="xxs" accessibilityRole="list">
          {list.map((report) => (
            <ScoutTriageRow
              key={report.id}
              kind={{ label: t(($) => $.scout.kinds[report.kind]), icon: kindIcon[report.kind] }}
              severity={
                report.severity
                  ? {
                      label: t(($) => $.scout.severities[report.severity ?? 'minor']),
                      strong: report.severity === 'blocking',
                    }
                  : undefined
              }
              text={report.text}
              author={{ name: report.author.name, avatar: sources(report.author.avatarUrl) }}
              date={report.createdAt}
              status={statusLook(t, report.status)}
              mission={report.mission ? t(($) => $.scout.triage.mission) : undefined}
              selected={report.id === selected?.id}
              onPress={() => setSelectedId(report.id)}
            />
          ))}
        </Stack>
        <FeedEnd
          state={
            reports.isFetchNextPageError
              ? 'error'
              : reports.isFetchingNextPage
                ? 'loading'
                : reports.hasNextPage
                  ? 'more'
                  : 'end'
          }
          moreLabel={t(($) => $.moderation.more)}
          errorLabel={t(($) => $.moderation.moreError)}
          retryLabel={t(($) => $.common.retry)}
          // Une seule demande à la fois, même après un double clic.
          onMore={() => {
            if (!reports.isFetchingNextPage) void reports.fetchNextPage()
          }}
        />
      </Stack>
    )

  const detail = selected ? <ReportDetail key={selected.id} report={selected} /> : null

  const reportsTab = columns ? (
    <Columns
      sideFirst
      sideWidth="wide"
      side={
        <Stack gap="md">
          {filterBar}
          {reportList}
        </Stack>
      }
      main={detail}
    />
  ) : (
    <Stack gap="md">
      {filterBar}
      {reportList}
    </Stack>
  )

  const body = phoneDetail ? (
    detail
  ) : (
    <Stack gap="xl">
      {head}
      <Tabs<Tab>
        label={t(($) => $.scout.triage.title)}
        tabs={[
          {
            key: 'reports',
            label: t(($) => $.scout.triage.tabReports, { count: totalReports }),
          },
          {
            key: 'scouts',
            label: t(($) => $.scout.triage.tabScouts, { count: triage.scouts.length }),
          },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      <TabPanel>{tab === 'reports' ? reportsTab : <ScoutList scouts={triage.scouts} />}</TabPanel>
    </Stack>
  )

  return (
    <Screen
      header={<TopNav />}
      onBack={phoneDetail ? () => setSelectedId(null) : back}
      title={t(($) => $.scout.triage.title)}
      width="page"
    >
      {body}
      <MissionsEditor
        open={editorOpen}
        missions={triage.missions}
        week={t(($) => $.scout.triage.editor.week, {
          start: new Intl.DateTimeFormat(i18n.language, {
            day: 'numeric',
            timeZone: 'Europe/Paris',
          }).format(noonOf(triage.week)),
          end: shortDate(noonOf(triage.week, 6).toISOString(), i18n.language),
        })}
        onClose={() => setEditorOpen(false)}
      />
      <Dialog
        visible={launchOpen}
        title={t(($) => $.scout.triage.launchTitle)}
        message={t(($) => $.scout.triage.launchBody)}
        busy={launch.isPending}
        error={launch.isError ? t(($) => $.errors[errorKey(launch.error)]) : undefined}
        onDismiss={() => setLaunchOpen(false)}
      >
        <Button
          label={t(($) => $.scout.triage.launch)}
          icon="rocket-launch"
          loading={launch.isPending}
          onPress={() => {
            if (launch.isPending) return
            launch.mutate(undefined, { onSuccess: () => setLaunchOpen(false) })
          }}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          disabled={launch.isPending}
          onPress={() => setLaunchOpen(false)}
        />
      </Dialog>
    </Screen>
  )
}

/**
 * La tuile du mois : pas lancé (avec « Lancer le mois »), en cours (le jour, la part écoulée, la
 * fin), ou fini (ce qui s'est arrêté). La fin (`endsAt`) est le minuit qui suit le 30e jour : la
 * page écrit ce 30e jour (« Jusqu'au 14 déc. à minuit »), une milliseconde avant.
 */
function MonthTile({
  program,
  onLaunch,
}: {
  program: ScoutTriage['program']
  onLaunch: () => void
}) {
  const { t, i18n } = useTranslation()
  const label = t(($) => $.scout.triage.month)
  if (!program.startedAt || !program.endsAt) {
    return (
      <GaugeTile
        label={label}
        value={t(($) => $.scout.triage.notLaunched)}
        detail={t(($) => $.scout.triage.notLaunchedHint)}
        action={
          <Button label={t(($) => $.scout.triage.launch)} icon="rocket-launch" onPress={onLaunch} />
        }
      />
    )
  }
  const now = new Date()
  const lastDay = shortDate(
    new Date(new Date(program.endsAt).getTime() - 1).toISOString(),
    i18n.language,
  )
  if (new Date(program.endsAt) <= now) {
    return (
      <GaugeTile
        label={label}
        value={t(($) => $.scout.triage.ended, { date: lastDay })}
        detail={t(($) => $.scout.triage.endedHint)}
      />
    )
  }
  const day = Math.min(SCOUT_PROGRAM_DAYS, parisDaysBetween(new Date(program.startedAt), now) + 1)
  return (
    <GaugeTile
      label={label}
      value={t(($) => $.scout.triage.day, { day, total: SCOUT_PROGRAM_DAYS })}
      ratio={day / SCOUT_PROGRAM_DAYS}
      detail={t(($) => $.scout.triage.until, { date: lastDay })}
    />
  )
}
