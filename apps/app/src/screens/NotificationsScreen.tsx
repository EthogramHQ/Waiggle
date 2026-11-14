// La page « Activité » (tranche 6b, redessinée en R8 : « /notifications ») : ce qui est arrivé au
// membre, du plus récent au plus ancien, rangé en « Aujourd'hui », « Cette semaine » et « Plus tôt »
// (jours de Paris, notifications/days.ts). Chaque ligne (ui/NotificationCard) montre qui a agi, la
// phrase, de quoi elle parle et quand ; ses textes et sa destination viennent de
// notifications/present.ts.
//
// Ouvrir l'écran marque tout comme vu, et la cloche revient à zéro : une seule fois, dès que la
// première page arrive, et jusqu'à l'heure que l'API a donnée avec elle (`asOf`), pas celle du
// téléphone. Ce qui arrive pendant la lecture reste donc nouveau pour la prochaine fois.
// La liste se lit 20 par 20 (« Afficher la suite ») et ne bouge jamais seule.
//
// Le miel (R8, décision de Louis du 12/11/2026) : une ligne nouvelle à la première lecture le reste
// pendant toute la visite, même quand « vu » relit la liste et que l'API ne la dit plus nouvelle.
// Sur ordinateur, « Tout marquer comme lu » éteint tout de suite ce miel (dans l'appli seulement :
// l'API sait déjà tout « vu »), et la colonne de droite résume ce qui part par e-mail.
//
// Les dates se disent par rapport à maintenant (« il y a 2 h », « hier » : R4, F-Fil3), sauf celle
// d'une décision de la modération, qui reste absolue et visible sans survol (jur-J2).
import type { Notification } from '@ruche/contracts'
import { type Href, useRouter } from 'expo-router'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useCategories } from '../categories/api'
import { useEmailPreferences } from '../email/api'
import { emailSummary } from '../email/summary'
import { useSuspension } from '../moderation/suspension'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMarkSeen, useNotifications } from '../notifications/api'
import { groupByDay } from '../notifications/days'
import { type Presented, presentNotification } from '../notifications/present'
import { shortDate } from '../projects/format'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { EmailSummary } from '../ui/EmailSummary'
import { FeedEnd, type FirstArrived, useFirstArrived } from '../ui/FeedEnd'
import { IconButton } from '../ui/IconButton'
import { LiveStatus } from '../ui/LiveStatus'
import {
  type NotificationAction,
  NotificationCard,
  type NotificationLeading,
  type NotificationThumb,
} from '../ui/NotificationCard'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

/**
 * Les notifications d'une décision de la modération : un retrait, un signalement traité, une
 * suspension et sa fin. Leur date est un repère qu'on cite (pour contester, par exemple) : elle
 * reste écrite en entier (« 21 oct. »), jamais « il y a 3 h » (relecture juridique jur-J2). Un
 * commentaire masqué par l'auteur du projet (`hidden`) n'en est pas une.
 */
const MODERATION_KINDS = new Set<Notification['kind']>([
  'removed',
  'report_handled',
  'suspended',
  'suspension_ended',
])

/** L'adresse des réglages des notifications (la roue sur téléphone, la colonne sur ordinateur). */
const SETTINGS = '/settings/notifications'

export function NotificationsScreen() {
  const { state, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (state === 'signedOut') return <SignedOutScreen />
  return <MemberNotifications />
}

/**
 * Le miel de la visite : pour chaque notification, ce que disait `isNew` la première fois qu'on l'a
 * lue. Une `Map` gardée dans un ref (useRef : une valeur qui survit aux affichages sans en
 * déclencher) ; « Tout marquer comme lu » la passe toute à « lu » et redessine l'écran
 * (`useReducer` sert ici de simple compteur de rendus).
 */
function useVisitHoney(items: readonly Notification[]) {
  const firstRead = useRef(new Map<string, boolean>())
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  // Pendant le rendu : seule une notification jamais vue s'ajoute, la même chose à chaque passage.
  for (const item of items)
    if (!firstRead.current.has(item.id)) firstRead.current.set(item.id, item.isNew)
  return {
    isNew: (id: string) => firstRead.current.get(id) ?? false,
    markAllRead: () => {
      for (const id of firstRead.current.keys()) firstRead.current.set(id, false)
      redraw()
    },
  }
}

function MemberNotifications() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/')
  const list = useNotifications()
  const { markSeen } = useMarkSeen()
  const suspended = useSuspension().suspended
  const { columns } = useLayout()
  const toSource = useMediaSources()
  const categories = useCategories().data?.categories
  // La colonne d'ordinateur seulement : sur téléphone, les réglages ne se lisent pas ici.
  const preferences = useEmailPreferences(columns).data

  // « Vu » une seule fois par ouverture, avec l'heure du serveur de la première page.
  const asOf = list.data?.pages[0]?.asOf
  const marked = useRef(false)
  useEffect(() => {
    if (!asOf || marked.current) return
    marked.current = true
    markSeen(asOf)
  }, [asOf, markSeen])

  const items = list.data?.pages.flatMap((page) => page.items) ?? []
  const honey = useVisitHoney(items)
  // Ce que dit le lecteur d'écran après « Tout marquer comme lu » : à l'œil, seul le miel s'éteint,
  // et le bouton reste à sa place (relecture de l'interface de R8, Louis 12/11/2026).
  const [allReadAnnounced, setAllReadAnnounced] = useState('')
  const markAllRead = () => {
    honey.markAllRead()
    setAllReadAnnounced(t(($) => $.notifications.allMarkedRead))
  }
  // La première notification arrivée avec la dernière page : le focus du clavier y va quand
  // « Afficher la suite » disparaît, la liste finissant sans phrase (jur-RF2).
  const arrived = useFirstArrived(items.length, list.isFetchingNextPage)
  // Une session expirée en cours de route : se reconnecter, pas réessayer.
  if (!list.data && list.isError && errorKey(list.error) === 'unauthorized')
    return <SignedOutScreen expired />

  const openSettings = () => router.push(SETTINGS)
  const empty = list.data !== undefined && items.length === 0

  /** Une ligne : la phrase de present.ts, ses images passées par la session (useMediaSources). */
  const row = (notification: Notification, ref: FirstArrived['ref'] | undefined) => {
    const shown = presentNotification(notification, t, new Date(), {
      language: i18n.language,
      categories,
    })
    const target = shown.target
    return (
      <NotificationCard
        key={notification.id}
        ref={ref}
        leading={leadingOf(shown, toSource)}
        parts={shown.parts}
        quote={shown.quote}
        reactions={shown.reactions}
        detail={shown.detail}
        thumb={thumbOf(shown, toSource)}
        when={
          MODERATION_KINDS.has(notification.kind)
            ? shortDate(notification.at, i18n.language)
            : { date: notification.at }
        }
        isNew={honey.isNew(notification.id)}
        onPress={target ? () => router.push(target) : null}
        action={actionOf(shown.action, (href) => router.push(href))}
      />
    )
  }

  // Les sections, chacune une liste annoncée. Le rang de la première ligne arrivée est compté sur
  // toute la page (`at`, gardé avec chaque notification) : c'est elle qui reçoit la vue que
  // `FeedEnd` focalise, même quand elle rejoint une section déjà commencée. La vue est le lien de
  // la ligne, que le lecteur d'écran du téléphone lit en entier (une case de liste ne se lit pas).
  const sections = groupByDay(
    items.map((notification, at) => ({ date: notification.at, notification, at })),
    new Date(),
  )
  const sectionViews = sections.map((section) => (
    <Stack key={section.key} gap="sm">
      <Text variant="headline" heading={2}>
        {t(($) => $.notifications.sections[section.key])}
      </Text>
      <Stack gap="xs" accessibilityRole="list">
        {section.items.map((entry) =>
          row(entry.notification, entry.at === arrived.index ? arrived.ref : undefined),
        )}
      </Stack>
    </Stack>
  ))

  const content = !list.data ? (
    // Une erreur avant toute page : on dit pourquoi et on propose de réessayer. Une suite ratée,
    // elle, garde les lignes déjà lues (voir FeedEnd plus bas).
    list.isError ? (
      <StateMessage
        kind="error"
        title={t(($) => $.notifications.errorTitle)}
        message={t(($) => $.errors[errorKey(list.error)])}
        actions={[{ label: t(($) => $.common.retry), onPress: () => void list.refetch() }]}
      />
    ) : (
      <StateMessage kind="loading" message={t(($) => $.common.loading)} />
    )
  ) : empty ? (
    // Rien encore (planche R8-Activite-Vide) : publier un projet (les autres y réagiront), ou aller
    // voir ceux des autres. Un compte suspendu ne publie plus (7c) : seulement explorer.
    <StateMessage
      kind="empty"
      title={t(($) => $.notifications.emptyTitle)}
      message={t(($) => $.notifications.empty)}
      actions={
        suspended
          ? [
              {
                label: t(($) => $.notifications.emptyActionSuspended),
                // R3 : « Découvrir » est devenu l'onglet Explorer.
                onPress: () => router.push('/explore'),
              },
            ]
          : [
              {
                label: t(($) => $.notifications.emptyAction),
                onPress: () => router.push('/projects/new'),
              },
              {
                label: t(($) => $.notifications.emptyExplore),
                variant: 'secondary',
                onPress: () => router.push('/explore'),
              },
            ]
      }
    />
  ) : (
    <Stack gap="xxl">
      {sectionViews}
      <FeedEnd
        state={
          list.isFetchingNextPage
            ? 'loading'
            : list.isFetchNextPageError
              ? 'error'
              : list.hasNextPage
                ? 'more'
                : 'end'
        }
        moreLabel={t(($) => $.notifications.more)}
        errorLabel={t(($) => $.notifications.moreError)}
        retryLabel={t(($) => $.common.retry)}
        firstArrived={arrived.ref}
        // Une seule demande à la fois, même après un double clic.
        onMore={() => {
          if (!list.isFetchingNextPage) void list.fetchNextPage()
        }}
      />
    </Stack>
  )

  return (
    <Screen
      // Liste vide : l'écran propose lui-même « Publier un projet » ; la barre ne le répète pas.
      header={<TopNav hideNewProject={empty} />}
      onBack={back}
      title={t(($) => $.notifications.title)}
      // Sur téléphone, la roue des réglages en haut à droite, sur la rangée du Retour (planche
      // R8-Activite). Sur ordinateur, la colonne y mène déjà : un seul contrôle de ce nom.
      topAction={
        columns ? undefined : (
          <IconButton
            icon="gear-six"
            label={t(($) => $.notifications.settings)}
            onPress={openSettings}
          />
        )
      }
      // Sur ordinateur, « Tout marquer comme lu » à côté du titre. Il reste à sa place après
      // l'appui (rien ne bouge sous le doigt) ; il n'a simplement plus rien à éteindre.
      titleAside={
        columns && items.length > 0 ? (
          <>
            <Button
              label={t(($) => $.notifications.markAllRead)}
              variant="secondary"
              size="compact"
              onPress={markAllRead}
            />
            {/* Montée avec le bouton, vide jusqu'à l'appui : une région déjà connue du lecteur
                d'écran annonce ce qui y change. Lue, jamais dessinée. */}
            <LiveStatus message={allReadAnnounced} visible={false} />
          </>
        ) : undefined
      }
      width={columns ? 'page' : undefined}
    >
      {columns ? (
        <Columns
          main={content}
          side={
            <EmailSummary
              title={t(($) => $.notifications.emailColumn.title)}
              summary={preferences ? emailSummary(preferences, t, i18n.language) : null}
              note={t(($) => $.notifications.emailColumn.counts)}
              actionLabel={t(($) => $.notifications.emailColumn.settings)}
              onAction={openSettings}
            />
          }
        />
      ) : (
        content
      )}
    </Screen>
  )
}

type MediaSource = ReturnType<typeof useMediaSources>

/** À gauche : la photo d'un membre passe par la session (useMediaSources) ; l'icône, telle quelle. */
const leadingOf = (shown: Presented, toSource: MediaSource): NotificationLeading =>
  shown.leading.kind === 'avatar'
    ? { kind: 'avatar', name: shown.leading.name, image: toSource(shown.leading.image) }
    : shown.leading

/**
 * Sous la ligne (R9) : un lien dans l'appli devient un toucher qui l'ouvre ; l'adresse de contact
 * passe telle quelle, la carte ouvre elle-même le brouillon.
 */
const actionOf = (
  action: Presented['action'],
  open: (target: Href) => void,
): NotificationAction | undefined => {
  if (!action) return undefined
  if ('contact' in action) return action
  return { label: action.label, onPress: () => open(action.target) }
}

/**
 * À droite : la couverture du projet, elle aussi par la session ; son résumé flou s'affiche le
 * temps qu'elle arrive. La vignette est un décor (la phrase nomme déjà le projet).
 */
const thumbOf = (shown: Presented, toSource: MediaSource): NotificationThumb | null => {
  const thumb = shown.thumb
  if (!thumb || thumb.kind === 'tool') return thumb
  return {
    kind: 'project',
    title: thumb.title,
    image: thumb.image
      ? {
          source: toSource(thumb.image.url),
          thumbhash: thumb.image.thumbhash,
          label: thumb.title,
        }
      : null,
  }
}
