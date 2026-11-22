// L'onglet Ruches (R10, docs/scenarios/refonte.md, « L'onglet Ruches » ; planches R10-Ruches et
// R10-Etats). « Mes ruches » remplace « Les ruches arrivent bientôt » :
// - en haut à droite, « Créer une ruche » (blanc : l'action miel de la page est « Rejoindre la
//   ruche » d'une invitation), et la phrase qui explique les ruches. Le titre « Ruches » n'est plus
//   affiché, dans aucun état (« Moins de mots », 16/11/2026 : l'onglet allumé le dit déjà) ; il
//   reste le titre de niveau 1 des lecteurs d'écran (`titleHidden` de Screen) ;
// - les invitations reçues, avec leur nombre en pastille : chaque carte dit qui invite et où, ses
//   trois promesses, « Rejoindre la ruche » et « Refuser » ; « … » pour signaler la ruche ;
// - mes ruches, une ligne chacune (`HiveRow`), dans l'ordre de l'API (la plus récemment active
//   d'abord) ; toute la ligne mène à la page de la ruche ;
// - sans ruche ni invitation : la mascotte qui dort, « Pas encore de ruche », la phrase et « Créer
//   une ruche » (en miel : c'est la seule action de la page).
//
// Les limites (10 ruches créées, 20 ruches en tout) : « Créer une ruche » reste à sa place, grisé,
// atteignable au clavier, et une phrase dit pourquoi. Un membre suspendu ne crée rien : le bouton
// n'est pas là (l'API refuserait de toute façon).
//
// Après « Rejoindre la ruche », la page de la ruche s'ouvre. Après « Refuser », la carte reste à sa
// place avec « Invitation refusée. » jusqu'au prochain passage sur l'onglet (relecture du plan,
// interface 14) : la liste relue ne l'a plus, l'écran la garde lui-même. Une invitation qui n'est
// plus valable (expirée : 410 ; ruche supprimée : 404) le dit dans une fenêtre, « Fermer » ; la
// carte reste dessous tant que la fenêtre est ouverte (une liste ne perd pas d'élément sous une
// fenêtre), puis part, et le focus va au titre de la section.
import { HIVE_LIMITS, type HiveInvitation as Invitation, type MyHives } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SessionGate } from '../accounts/SessionGate'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useAcceptInvitation, useMyHives, useRefuseInvitation } from '../hives/api'
import { useSuspension } from '../moderation/suspension'
import { Button } from '../ui/Button'
import { CardGrid } from '../ui/CardGrid'
import { CountBadge } from '../ui/CountBadge'
import { Dialog } from '../ui/Dialog'
import {
  type Focusable,
  focusAndReveal,
  focusWithoutScroll,
  holdsFocus,
  moveReaderTo,
} from '../ui/focus'
import { HiveCard, hiveCardGrid } from '../ui/HiveCard'
import { HiveInvitation } from '../ui/HiveInvitation'
import { HiveRow } from '../ui/HiveRow'
import { ListGroup } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { useScreenShownCount } from '../ui/screenFocus'
import { Text } from '../ui/Text'
import { useTapGuard } from '../ui/tapGuard'
import { useCalmMotion } from '../ui/theme/motion'
// L'attente de l'onglet et le cadre de ses pages, dans un module léger : la route les montre aussi
// pendant l'arrivée du morceau de cet écran (app/hives.tsx).
import { HivesLoading, usePageFrame } from './HivesLoading'
import { SignedOutScreen } from './states'

export function HivesScreen() {
  // R16 : la garde commune. Pendant la lecture de la session, le squelette de l'onglet, le même que
  // pendant celle des ruches ; une session illisible propose de réessayer ; un visiteur, de se
  // connecter. Les lectures ne partent qu'avec une session : elles vivent dans `Hives`.
  return <SessionGate loading={<HivesLoading />}>{() => <Hives />}</SessionGate>
}

function Hives() {
  const { t } = useTranslation()
  const { frame } = usePageFrame()
  const mine = useMyHives()
  // Les ruches d'abord : une relecture qui échoue (après un geste) garde ce qui est affiché.
  if (mine.data) return <HivesView mine={mine.data} />
  // Une erreur pendant une nouvelle tentative (« Réessayer ») : on montre l'attente.
  if (mine.error && !mine.isFetching) {
    const key = errorKey(mine.error)
    // La session a expiré pendant la visite : se reconnecter, pas réessayer.
    if (key === 'unauthorized') return <SignedOutScreen expired />
    return (
      <Screen {...frame}>
        <StateMessage
          kind="error"
          title={t(($) => $.hives.loadError)}
          message={t(($) => $.errors[key])}
          actions={[{ label: t(($) => $.common.retry), onPress: () => void mine.refetch() }]}
        />
      </Screen>
    )
  }
  return <HivesLoading />
}

/** Une invitation gardée à l'écran après que la liste l'a perdue, à la place qu'elle avait. */
type Kept = { invitation: Invitation; index: number }

/**
 * Les invitations à montrer : celles de l'API, et celles que l'écran garde (refusées, ou qui ne
 * valent plus pendant que la fenêtre le dit), chacune à la place qu'elle avait quand on l'a touchée.
 */
const withKept = (fromApi: readonly Invitation[], kept: readonly Kept[]): Invitation[] => {
  const keptIds = new Set(kept.map((one) => one.invitation.id))
  const list = fromApi.filter((one) => !keptIds.has(one.id))
  for (const one of [...kept].sort((a, b) => a.index - b.index))
    list.splice(Math.min(one.index, list.length), 0, one.invitation)
  return list
}

/** Le message d'un échec de « Rejoindre » ou de « Refuser », sous sa carte. */
type Failure = { id: string; text: string }

/** Les refus que l'API explique elle-même ; les autres prennent la phrase de la carte. */
const explained: ReadonlySet<ApiErrorKey> = new Set([
  'hivesJoinedLimit',
  'hiveFull',
  'alreadyHiveMember',
  'suspended',
  'rateLimited',
  'network',
  // La session a expiré pendant la visite : « Connecte-toi pour continuer. »
  'unauthorized',
])

function HivesView({ mine }: { mine: MyHives }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const { suspended } = useSuspension()
  const guard = useTapGuard()
  const accept = useAcceptInvitation()
  const refuse = useRefuseInvitation()
  const reasonId = useId()
  const { wide, frame } = usePageFrame()

  // Les invitations refusées, gardées à leur place jusqu'au prochain passage sur l'onglet : quand
  // la page redevient affichée (`useScreenShownCount` avance), on les oublie. Le nombre se compare
  // pendant le rendu (et non dans un effet) : la carte part dans le même dessin que l'arrivée.
  const [refused, setRefused] = useState<Record<string, Kept>>({})
  const shownCount = useScreenShownCount()
  const [seenCount, setSeenCount] = useState(shownCount)
  if (shownCount !== seenCount) {
    setSeenCount(shownCount)
    setRefused({})
  }

  // L'invitation qui ne vaut plus (410 : expirée ; 404 : la ruche a été supprimée), et la fenêtre
  // qui le dit. La carte reste dessous jusqu'à la fin du fondu de fermeture (`onClosed`).
  const [gone, setGone] = useState<(Kept & { expired: boolean }) | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const closeRef = useRef<Focusable>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  // L'échec s'écrit sous la carte touchée, qui peut être au bas de l'écran : il vient au milieu de
  // la zone qui défile à son apparition. Au milieu, et non « juste assez » (`revealWithoutJump`) :
  // la barre d'onglets du téléphone flotte sur le bas de la page sans que le défilement le sache
  // (`Screen` ne réserve sa place qu'à `floating`), et « juste assez » laissait le message dessous.
  // `focusAndReveal` ne pose aucun focus ici : le cadre n'en prend pas (ni bouton ni tabIndex).
  const failureNotice = useRef<Focusable>(null)
  const calm = useCalmMotion()
  useEffect(() => {
    if (failure) focusAndReveal(failureNotice.current, calm)
  }, [failure, calm])

  // Le titre « Invitations » et celui de « Mes ruches » : où va le focus quand la carte de la
  // fenêtre part (sinon il tomberait sur toute la page).
  const section = useRef<Focusable>(null)
  const invitationsTitle = useRef<Focusable>(null)
  const hivesTitle = useRef<Focusable>(null)
  const refocus = useRef(false)

  const kept = [...Object.values(refused), ...(gone ? [gone] : [])]
  const invitations = withKept(mine.invitations, kept)
  // Le nombre de la pastille : les invitations qui attendent encore une réponse.
  const waiting = invitations.filter((one) => !refused[one.id]).length

  useEffect(() => {
    if (gone || !refocus.current) return
    refocus.current = false
    // La carte est partie : le focus, s'il était chez elle, va au titre de la section.
    if (holdsFocus(section.current)) return
    const target = invitations.length > 0 ? invitationsTitle.current : hivesTitle.current
    focusWithoutScroll(target)
    moveReaderTo(target)
  })

  const createdFull = mine.createdCount >= HIVE_LIMITS.created
  const joinedFull = mine.hives.length >= HIVE_LIMITS.joined
  const limit = createdFull
    ? t(($) => $.hives.createdLimit)
    : joinedFull
      ? t(($) => $.hives.joinedLimit)
      : null
  const openCreate = guard(() => router.push('/hives/new'))
  // Une garde commune : la seconde tape d'une double tape n'ouvre ni une deuxième page, ni la
  // feuille de création par-dessus la ruche.
  const openHive = (id: string) =>
    guard(() => router.push({ pathname: '/hives/[id]', params: { id } }))

  const onAccept = async (invitation: Invitation, index: number) => {
    setFailure(null)
    try {
      const hive = await accept.mutateAsync(invitation.id)
      // Membre : la ruche ouverte (le Retour ramène à l'onglet, où elle a pris sa place).
      router.push({ pathname: '/hives/[id]', params: { id: hive.id } })
    } catch (error) {
      onFailure(
        invitation,
        index,
        error,
        t(($) => $.hives.invitations.acceptError),
      )
    }
  }

  const onRefuse = async (invitation: Invitation, index: number) => {
    setFailure(null)
    try {
      await refuse.mutateAsync(invitation.id)
      setRefused((before) => ({ ...before, [invitation.id]: { invitation, index } }))
    } catch (error) {
      onFailure(
        invitation,
        index,
        error,
        t(($) => $.hives.invitations.refuseError),
      )
    }
  }

  const onFailure = (invitation: Invitation, index: number, error: unknown, fallback: string) => {
    const key = errorKey(error)
    if (key === 'invitationExpired' || key === 'notFound') {
      setGone({ invitation, index, expired: key === 'invitationExpired' })
      setDialogOpen(true)
      return
    }
    setFailure({ id: invitation.id, text: explained.has(key) ? t(($) => $.errors[key]) : fallback })
  }

  // La fenêtre fermée : la carte part après le fondu (Android n'appelle pas `onClosed` : tout de
  // suite).
  const closeDialog = () => {
    setDialogOpen(false)
    if (Platform.OS === 'android') dropGone()
  }
  const dropGone = () => {
    refocus.current = true
    setGone(null)
  }

  const createButton = suspended ? null : (
    <Button
      label={t(($) => $.hives.create)}
      icon="plus"
      variant="secondary"
      size="compact"
      onPress={openCreate}
      disabled={limit !== null}
      focusableWhenDisabled
      describedById={limit === null ? undefined : reasonId}
      hint={limit ?? undefined}
    />
  )
  const limitText =
    limit === null || suspended ? null : (
      // `readable` : en grand, la phrase reste à une longueur de ligne confortable.
      <Text variant="caption" tone="secondary" nativeID={reasonId} readable>
        {limit}
      </Text>
    )

  const expiredDialog = (
    <Dialog
      visible={dialogOpen}
      title={t(($) => $.hives.invitations.expiredTitle)}
      // 410 : « Elle a expiré après 30 jours. » ; 404 (ruche supprimée) : le titre seul.
      {...(gone?.expired ? { message: t(($) => $.hives.invitations.expired) } : null)}
      onDismiss={closeDialog}
      onClosed={dropGone}
      initialFocusRef={closeRef}
    >
      <Button
        ref={closeRef}
        label={t(($) => $.hives.invitations.close)}
        variant="secondary"
        onPress={closeDialog}
      />
    </Dialog>
  )

  // Ni ruche ni invitation : l'état vide, avec la mascotte.
  if (mine.hives.length === 0 && invitations.length === 0) {
    return (
      // En grand, l'état vide reste calé sur la marge de gauche du gabarit (choix 10 des planches).
      <Screen {...frame}>
        <StateMessage
          kind="empty"
          title={t(($) => $.hives.emptyTitle)}
          message={t(($) => $.hives.intro)}
          actions={
            suspended || limit !== null
              ? []
              : [{ label: t(($) => $.hives.create), onPress: openCreate }]
          }
        >
          {limitText}
        </StateMessage>
        {expiredDialog}
      </Screen>
    )
  }

  // Les invitations, une carte chacune (et son échec dessous) : en colonne, ou dans la grille.
  // En grand, chaque carte prend la hauteur de sa case (`grow`, puis `fill`) : les invitations d'une
  // rangée ont la même hauteur, même quand un nom de ruche passe sur deux lignes.
  const invitationCards = invitations.map((invitation, index) => (
    <Stack key={invitation.id} gap="sm" align="stretch" grow={wide}>
      <HiveInvitation
        fill={wide}
        invitation={invitation}
        onAccept={() => onAccept(invitation, index)}
        onRefuse={() => onRefuse(invitation, index)}
        onReport={() =>
          router.push({
            pathname: '/report',
            params: { kind: 'hive', id: invitation.hive.id },
          })
        }
        refused={Boolean(refused[invitation.id])}
        // Une seule action miel par écran (R10) : « Rejoindre » en miel sur la première
        // carte qui a encore ses boutons, en blanc sur les autres.
        primary={index === invitations.findIndex((one) => !refused[one.id])}
      />
      {failure?.id === invitation.id ? (
        // La ref sur un cadre, pas sur `Notice` : une `Notice` à ref attend le focus et
        // cesse d'être annoncée ; celle-ci garde son annonce, le focus reste au bouton.
        <Stack ref={failureNotice} align="stretch">
          <Notice message={failure.text} />
        </Stack>
      ) : null}
    </Stack>
  ))

  return (
    <Screen {...frame} titleAside={createButton}>
      <Stack gap="xl" align="stretch">
        {limitText}

        {invitations.length > 0 ? (
          <Stack ref={section} gap="md" align="stretch">
            <Row gap="sm" align="center">
              <Text
                variant="heading"
                heading={2}
                focusRef={invitationsTitle}
                // Le nombre de la pastille (cachée aux lecteurs d'écran) se dit avec le titre.
                {...(waiting > 0
                  ? {
                      accessibilityLabel: `${t(($) => $.hives.invitations.title)}, ${t(
                        ($) => $.hives.invitations.count,
                        { count: waiting },
                      )}`,
                    }
                  : null)}
              >
                {t(($) => $.hives.invitations.title)}
              </Text>
              <CountBadge count={waiting} />
            </Row>
            {wide ? (
              // En grand : les invitations sur les colonnes des ruches (planches R16-Ruches).
              <CardGrid {...hiveCardGrid}>{invitationCards}</CardGrid>
            ) : (
              invitationCards
            )}
          </Stack>
        ) : null}

        {mine.hives.length > 0 ? (
          <Stack gap="md" align="stretch">
            <Text variant="heading" heading={2} focusRef={hivesTitle}>
              {t(($) => $.hives.mine)}
            </Text>
            {wide ? (
              // En grand : une carte par ruche, autant de colonnes que la place le permet.
              <CardGrid {...hiveCardGrid}>
                {mine.hives.map((hive) => (
                  <HiveCard
                    key={hive.id}
                    hive={hive}
                    onPress={openHive(hive.id)}
                    toSource={toSource}
                  />
                ))}
              </CardGrid>
            ) : (
              <ListGroup list>
                {mine.hives.map((hive) => (
                  <HiveRow
                    key={hive.id}
                    hive={hive}
                    onPress={openHive(hive.id)}
                    toSource={toSource}
                  />
                ))}
              </ListGroup>
            )}
          </Stack>
        ) : null}
      </Stack>
      {expiredDialog}
    </Screen>
  )
}
