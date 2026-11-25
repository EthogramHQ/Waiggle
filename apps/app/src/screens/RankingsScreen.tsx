// Page « Classement de la semaine » (R19, « /harvest/rankings », planche R19-Classement), poussée
// depuis « Ma récolte » : le pollen de la semaine des proches (ceux que le membre suit, et lui), puis
// un classement par ruche. Seuls ceux qui ont gagné du pollen cette semaine y figurent ; tout repart
// lundi (docs/scenarios/refonte.md, « Le classement de la semaine »).
//
// Le choix du classement (plan R19, choix d'interface) : un choix segmenté (Proches et chaque ruche)
// tant qu'il y a au plus trois ruches ; au-delà, les choix ne tiendraient plus côte à côte, et un
// menu « Classement, Proches » les réunit. Le paramètre d'adresse `hive` (un lien de « Défis de mes
// ruches », un lien partagé) ouvre directement le classement d'une ruche ; il se lit après
// l'hydratation de la page web (`useHydrated`), le pré-rendu ne connaît pas l'adresse complète.
//
// Les états : le lundi matin, avant le premier pollen, la mascotte endormie et une phrase ; un
// membre qui a choisi de ne pas apparaître dans les classements ne les voit pas non plus (l'API
// répond `rankings_off`) : la phrase du retrait, et « Changer ce choix » vers les réglages.
import type { Ranking } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useRankings } from '../gamification/api'
import { useMyHives } from '../hives/api'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { MenuField } from '../ui/MenuField'
import { RankingList, type RankingRow } from '../ui/RankingList'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'
import { LoadingScreen, SignedOutScreen } from './states'

/** Le choix des proches ; les autres choix sont l'identifiant d'une ruche. */
const CLOSE = 'close'

/** Au-delà de ce nombre de ruches, le choix segmenté laisse la place à un menu. */
const SEGMENTED_HIVES_MAX = 3

/**
 * La garde de session commune (accounts/SessionGate.tsx) : en attente, le squelette d'une liste, à
 * la largeur de la page ; un visiteur : « Réservé aux membres ».
 */
export function RankingsScreen() {
  return (
    <SessionGate loading={<LoadingScreen shape="list" width="form" />} width="form">
      {() => <Rankings />}
    </SessionGate>
  )
}

function Rankings() {
  const { t } = useTranslation()
  const router = useRouter()
  // Sans historique (un lien ouvert seul), le Retour mène à « Ma récolte », d'où la page s'ouvre.
  const back = useGoBack('/harvest')
  const toSource = useMediaSources()

  // L'adresse ne se lit qu'une fois la page hydratée : le pré-rendu ne la connaît pas.
  const hydrated = useHydrated()
  const params = useLocalSearchParams<{ hive?: string | string[] }>()
  const fromAddress = hydrated ? firstParam(params.hive) : undefined

  const hives = useMyHives()
  const hiveList = hives.data?.hives ?? []

  // Le choix du membre, une fois qu'il a touché le contrôle ; avant, celui de l'adresse, sinon les
  // proches. Une ruche de l'adresse dont il n'est pas (plus) membre : les proches, une fois ses
  // ruches lues (l'API répondrait « introuvable »).
  const [picked, setPicked] = useState<string | null>(null)
  const wanted = picked ?? fromAddress ?? CLOSE
  const scope =
    wanted !== CLOSE && hives.data && !hiveList.some((hive) => hive.id === wanted) ? CLOSE : wanted
  const ranking = useRankings(
    scope === CLOSE ? 'close' : 'hive',
    scope === CLOSE ? undefined : scope,
    // Avant l'hydratation, l'adresse n'est pas lue : on ne demande pas un classement pour rien.
    { enabled: hydrated },
  )

  // Pendant qu'un autre classement se charge, celui d'avant reste affiché : la liste ne disparaît
  // pas sous le doigt pour revenir une seconde plus tard (le choix touché garde sa place).
  const lastShown = useRef<Ranking | null>(null)
  if (ranking.data) lastShown.current = ranking.data
  const shown = ranking.data ?? (ranking.isPending ? lastShown.current : null)

  const choose = (value: string) => {
    setPicked(value)
    // L'adresse suit le choix : Retour, puis revenir, ou recharger la page, rouvre le même.
    router.setParams({ hive: value === CLOSE ? undefined : value })
  }

  const off = !shown && ranking.isError && errorKey(ranking.error) === 'rankingsOff'
  if (!shown && ranking.isError && errorKey(ranking.error) === 'unauthorized')
    return <SignedOutScreen expired width="form" />

  // Le choix de la portée : seulement avec au moins une ruche (un seul choix ne choisit rien), et
  // jamais pour un membre retiré des classements, qui n'en voit aucun.
  const options = [
    { value: CLOSE, label: t(($) => $.game.rankings.close) },
    ...hiveList.map((hive) => ({ value: hive.id, label: hive.name ?? t(($) => $.hives.unnamed) })),
  ]
  const scopeChoice =
    off || hiveList.length === 0 ? null : hiveList.length <= SEGMENTED_HIVES_MAX ? (
      <Segmented
        label={t(($) => $.game.rankings.scope)}
        options={options}
        value={scope}
        onChange={choose}
      />
    ) : (
      <MenuField
        label={t(($) => $.game.rankings.scope)}
        value={scope}
        options={options}
        onChange={choose}
        // Toujours un choix (les proches par défaut) : la ligne ne montre jamais ce texte.
        placeholder={t(($) => $.game.rankings.close)}
      />
    )

  // Les lignes : le rang calculé par l'API, et la page de chaque membre.
  const rows: RankingRow[] = (shown?.rows ?? []).map((row) => ({
    rank: row.rank,
    name: row.member.name,
    avatar: row.member.avatarUrl,
    pollen: row.pollen,
    self: row.self,
    href: `/members/${encodeURIComponent(row.member.id)}`,
  }))

  // Le contenu attend aussi les ruches : le choix de portée arrive avec la liste, sans la pousser.
  const waiting = !shown && (ranking.isPending || hives.isPending)

  return (
    <Screen header={<TopNav />} onBack={back} title={t(($) => $.game.rankings.title)} width="form">
      {off ? (
        // Retiré des classements : la phrase (ce qu'il garde, ce qu'il ne voit plus) et l'issue.
        <StateMessage
          kind="empty"
          picture={null}
          message={t(($) => $.game.harvest.rankings.off)}
          actions={[
            {
              label: t(($) => $.game.harvest.rankings.change),
              variant: 'secondary',
              onPress: () => router.push('/settings/appearance'),
            },
          ]}
        />
      ) : waiting ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : !shown ? (
        <StateMessage
          kind="error"
          title={t(($) => $.game.rankings.loadError)}
          message={t(($) => $.errors[errorKey(ranking.error)])}
          actions={[
            {
              label: t(($) => $.common.retry),
              onPress: () => void ranking.refetch(),
              loading: ranking.isFetching,
            },
          ]}
        />
      ) : (
        <Stack gap="lg">
          {scopeChoice}
          {rows.length === 0 ? (
            // Le lundi, avant le premier pollen : la mascotte endormie (celle d'un état vide).
            <StateMessage kind="empty" message={t(($) => $.game.rankings.empty)} />
          ) : (
            <Stack gap="sm">
              <RankingList rows={rows} toSource={toSource} />
              <Text variant="caption" tone="muted">
                {t(($) => $.game.rankings.footnote)}
              </Text>
            </Stack>
          )}
        </Stack>
      )}
    </Screen>
  )
}
