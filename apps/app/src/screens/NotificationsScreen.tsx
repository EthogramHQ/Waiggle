// L'écran des notifications (tranche 6b, « /notifications ») : ce qui est arrivé au membre, du plus
// récent au plus ancien. Les réactions et les nouveaux abonnés, groupés par jour et sans nom ; les
// commentaires, un par un ; le pseudo reçu. Les nouvelles sont signalées (« Nouveau »).
//
// Ouvrir l'écran marque tout comme vu, et la cloche revient à zéro : une seule fois, dès que la
// première page arrive, et jusqu'à l'heure que l'API a donnée avec elle (`asOf`), pas celle du
// téléphone. Ce qui arrive pendant la lecture reste donc nouveau pour la prochaine fois.
// La liste se lit 20 par 20 (« Afficher la suite », puis « C'est tout ») et ne bouge jamais seule.
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMarkSeen, useNotifications } from '../notifications/api'
import { presentNotification } from '../notifications/present'
import { shortDate } from '../projects/format'
import { FeedEnd } from '../ui/FeedEnd'
import { NotificationCard } from '../ui/NotificationCard'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { LoadingScreen, SignedOutScreen } from './states'

export function NotificationsScreen() {
  const { data: session, isPending } = useSession()
  if (isPending) return <LoadingScreen />
  if (!session) return <SignedOutScreen />
  return <MemberNotifications />
}

function MemberNotifications() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/')
  const list = useNotifications()
  const { markSeen } = useMarkSeen()

  // « Vu » une seule fois par ouverture, avec l'heure du serveur de la première page. Un ref
  // (useRef) garde une valeur d'un affichage à l'autre sans redessiner l'écran : ici, « déjà fait ».
  const asOf = list.data?.pages[0]?.asOf
  const marked = useRef(false)
  useEffect(() => {
    if (!asOf || marked.current) return
    marked.current = true
    markSeen(asOf)
  }, [asOf, markSeen])

  const items = list.data?.pages.flatMap((page) => page.items) ?? []
  // Une session expirée en cours de route : se reconnecter, pas réessayer.
  if (!list.data && list.isError && errorKey(list.error) === 'unauthorized')
    return <SignedOutScreen expired />

  return (
    <Screen
      // Liste vide : l'écran propose lui-même « Publier un projet » ; la barre ne le répète pas.
      header={<TopNav hideNewProject={list.data !== undefined && items.length === 0} />}
      onBack={back}
      title={t('notifications.title')}
    >
      {!list.data ? (
        // Une erreur avant toute page : on dit pourquoi et on propose de réessayer. Une suite
        // ratée, elle, garde les cartes déjà lues (voir FeedEnd plus bas).
        list.isError ? (
          <StateMessage
            kind="error"
            title={t('notifications.errorTitle')}
            message={t(`errors.${errorKey(list.error)}`)}
            actions={[{ label: t('common.retry'), onPress: () => void list.refetch() }]}
          />
        ) : (
          <StateMessage kind="loading" message={t('common.loading')} />
        )
      ) : items.length === 0 ? (
        // Rien encore : ce qui en fera venir, c'est un projet publié (les autres y réagiront).
        // Un titre, comme tous les états de l'appli : c'est lui que lit d'abord un lecteur d'écran
        // qui parcourt la page par ses titres.
        <StateMessage
          kind="empty"
          title={t('notifications.emptyTitle')}
          message={t('notifications.empty')}
          actions={[
            { label: t('notifications.emptyAction'), onPress: () => router.push('/projects/new') },
          ]}
        />
      ) : (
        <Stack gap="lg">
          {/* Une liste annoncée : « liste, 20 éléments », et on saute d'une notification à l'autre. */}
          <Stack gap="sm" accessibilityRole="list">
            {items.map((notification) => {
              const shown = presentNotification(notification, t)
              const target = shown.target
              return (
                <NotificationCard
                  key={notification.id}
                  icon={shown.icon}
                  text={shown.text}
                  detail={shown.detail}
                  quote={shown.quote}
                  when={shortDate(notification.at, i18n.language)}
                  isNew={notification.isNew}
                  newLabel={t('notifications.new')}
                  onPress={target ? () => router.push(target) : null}
                />
              )
            })}
          </Stack>
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
            moreLabel={t('notifications.more')}
            endLabel={t('notifications.end')}
            errorLabel={t('notifications.moreError')}
            retryLabel={t('common.retry')}
            // Une seule demande à la fois, même après un double clic.
            onMore={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage()
            }}
          />
        </Stack>
      )}
    </Screen>
  )
}
