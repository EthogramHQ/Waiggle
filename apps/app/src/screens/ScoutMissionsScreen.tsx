// La page « Missions de la semaine » des Éclaireuses (« /scout/missions », tranche R20, planche
// R20-Missions), ouverte depuis « Ma récolte », les réglages « Les Éclaireuses » et l'Activité.
//
// Les missions à faire d'abord, chacune avec son pollen (« +30 pollen ») ; puis celles déjà faites
// (« Faite »), encore touchables : y répondre une seconde fois ne rapporte plus rien, mais un retour
// de plus reste utile. « Répondre » ouvre la feuille « Ton retour » avec la mission choisie
// (`/scout-report?from=/scout/missions&mission=<id>`). Ni date limite, ni compte à rebours : une
// mission non faite disparaît le lundi, sans reproche.
//
// Une semaine sans mission le dit en une phrase. La page est réservée aux Éclaireuses pendant le
// mois : l'API refuse les autres (`scout_only`), et la page le dit, avec un chemin vers les réglages
// des Éclaireuses.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import { POLLEN_GESTURES, type ScoutMissions } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useScoutMissions } from '../scout/api'
import { Button } from '../ui/Button'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { StatusLabel } from '../ui/ScoutTriageRow'
import { Screen } from '../ui/Screen'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { LoadingScreen } from './states'

const PAGE_PATH = '/scout/missions'
const SETTINGS_PATH = '/settings/scouts'

/** L'adresse de la feuille « Ton retour », ouverte sur une mission depuis cette page. */
const answerHref = (missionId: string) =>
  `/scout-report?${new URLSearchParams({ from: PAGE_PATH, mission: missionId }).toString()}`

export function ScoutMissionsScreen() {
  // La garde commune (attente, erreur, visiteur) ; les missions ne se lisent qu'avec une session.
  return (
    <SessionGate loading={<LoadingScreen shape="list" width="form" />}>
      {() => <Missions />}
    </SessionGate>
  )
}

/** Les missions à faire d'abord, puis les faites, chacune dans l'ordre de l'administrateur. */
const inOrder = (missions: ScoutMissions['missions']) => [
  ...missions.filter((mission) => !mission.done),
  ...missions.filter((mission) => mission.done),
]

function Missions() {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/harvest')
  const missions = useScoutMissions()
  const [retrying, setRetrying] = useState(false)

  const title = t(($) => $.scout.missions.title)
  const data = missions.data
  const left = data ? data.missions.filter((mission) => !mission.done).length : 0

  let content: ReactNode
  if (!data && (missions.isError || retrying)) {
    const key = errorKey(missions.error)
    content =
      key === 'scoutOnly' ? (
        // Pas (ou plus) Éclaireuse : la page le dit, et mène aux réglages des Éclaireuses.
        <StateMessage
          kind="error"
          title={t(($) => $.errors.scoutOnly)}
          actions={[
            {
              label: t(($) => $.scout.drop.settings),
              onPress: () => router.replace(SETTINGS_PATH),
            },
          ]}
        />
      ) : (
        <StateMessage
          kind="error"
          title={t(($) => $.errors[key])}
          actions={[
            {
              label: t(($) => $.common.retry),
              loading: retrying,
              onPress: () => {
                setRetrying(true)
                void missions.refetch().finally(() => setRetrying(false))
              },
            },
          ]}
        />
      )
  } else if (!data) {
    content = <StateMessage kind="loading" message={t(($) => $.common.loading)} />
  } else if (data.missions.length === 0) {
    content = <StateMessage kind="empty" title={t(($) => $.scout.missions.empty)} />
  } else {
    const pollen = t(($) => $.scout.missions.pollen, {
      count: POLLEN_GESTURES.scout_mission.amount,
    })
    content = (
      <ListGroup list>
        {inOrder(data.missions).map((mission) => {
          const href = answerHref(mission.id)
          return (
            <ListRow
              key={mission.id}
              icon={mission.done ? 'check' : 'flag'}
              label={mission.text}
              detail={
                mission.done ? (
                  <StatusLabel label={t(($) => $.scout.missions.done)} tone="neutral" />
                ) : (
                  <StatusPill label={pollen} />
                )
              }
              accessory={
                <Button
                  label={t(($) => $.scout.missions.answer)}
                  // Le nom lu dit à quelle mission on répond : trois « Répondre » se suivent.
                  hint={mission.text}
                  variant="secondary"
                  size="small"
                  onPress={() => router.push(href)}
                />
              }
            />
          )
        })}
      </ListGroup>
    )
  }

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={title}
      {...(left > 0 ? { subtitle: t(($) => $.scout.missions.left, { count: left }) } : null)}
    >
      {content}
    </Screen>
  )
}
