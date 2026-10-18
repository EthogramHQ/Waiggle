// Les états communs à tous les écrans qui chargent quelque chose : le chargement, la page réservée
// aux membres, l'erreur et la page introuvable. Chaque écran les assemble de la même façon, avec
// toujours une issue (réessayer, revenir, se connecter), au lieu d'un titre seul sur une page vide.
//
// Tous ont la même barre en haut et la même largeur que la page qu'ils remplacent (`width`) : la
// mise en page ne saute pas quand le chargement devient le contenu, ou une erreur.
import { type Href, usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { Screen } from '../ui/Screen'
import { StateMessage } from '../ui/StateMessage'

/** form : un écran étroit (profil, formulaire) ; page : une page large (projet, membre). */
type Width = 'form' | 'page'

/**
 * Pendant le chargement. Pas de titre d'onglet propre : la page web pré-rendue (celle que montrent
 * les aperçus d'un lien partagé) en reste à ce stade, et y lirait « Chargement… ».
 */
export function LoadingScreen({ width = 'form' }: { width?: Width }) {
  const { t } = useTranslation()
  return (
    <Screen header={<TopNav />} width={width}>
      <StateMessage kind="loading" message={t('common.loading')} />
    </Screen>
  )
}

/**
 * Une page réservée aux membres, vue par un visiteur. « Se connecter » revient ensuite sur cette
 * même page (paramètre `next`, vérifié par la page de connexion : voir navigation/next.ts).
 */
export function SignedOutScreen({ width = 'form' }: { width?: Width }) {
  const { t } = useTranslation()
  const router = useRouter()
  // usePathname : le chemin de la page affichée (« /members/abc »).
  const pathname = usePathname()
  return (
    <Screen header={<TopNav />} width={width} pageTitle={t('states.signedOutTitle')}>
      <StateMessage
        kind="signedOut"
        title={t('states.signedOutTitle')}
        message={t('home.membersOnly')}
        actions={[
          {
            label: t('home.signIn'),
            // push (et non replace) : le retour depuis la connexion ramène sur cette page.
            onPress: () => router.push({ pathname: '/sign-in', params: { next: pathname } }),
          },
          { label: t('home.signUp'), onPress: () => router.push('/sign-up') },
        ]}
      />
    </Screen>
  )
}

/**
 * Le chargement a échoué. « Réessayer » relance la demande (`onRetry`, par exemple le `refetch` de
 * React Query) : la page repasse alors par l'état de chargement, signe que la demande est partie.
 * « Revenir » ramène à la page précédente, ou à `fallback`.
 * Une session expirée en cours de route (refus « unauthorized ») n'est pas une erreur à réessayer :
 * on propose de se reconnecter, comme à un visiteur.
 */
export function LoadErrorScreen({
  error,
  onRetry,
  fallback = '/',
  width = 'form',
}: {
  error: unknown
  onRetry: () => void
  fallback?: Href
  width?: Width
}) {
  const { t } = useTranslation()
  const back = useGoBack(fallback)
  const key = errorKey(error)
  if (key === 'unauthorized') return <SignedOutScreen width={width} />
  return (
    <Screen header={<TopNav />} width={width} pageTitle={t('states.errorTitle')}>
      <StateMessage
        kind="error"
        title={t('states.errorTitle')}
        message={t(`errors.${key}`)}
        actions={[
          { label: t('common.retry'), onPress: onRetry },
          { label: t('states.back'), onPress: back },
        ]}
      />
    </Screen>
  )
}

/** Ce qu'on cherchait n'existe pas (ou n'est pas visible) : retour à l'accueil. */
export function NotFoundState({
  title,
  message,
  width = 'form',
}: {
  title: string
  message?: string
  width?: Width
}) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen header={<TopNav />} width={width} pageTitle={title}>
      <StateMessage
        kind="notFound"
        title={title}
        {...(message ? { message } : null)}
        actions={[{ label: t('states.home'), onPress: () => router.replace('/') }]}
      />
    </Screen>
  )
}

/** Un membre ouvre la modification d'un projet qui n'est pas le sien : il peut le voir, pas le changer. */
export function NotMineState({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen header={<TopNav />} pageTitle={t('states.notMineTitle')}>
      <StateMessage
        kind="signedOut"
        title={t('states.notMineTitle')}
        message={t('project.page.notMine')}
        actions={[
          {
            label: t('states.seeProject'),
            onPress: () =>
              router.replace({ pathname: '/projects/[id]', params: { id: projectId } }),
          },
          { label: t('states.home'), onPress: () => router.replace('/') },
        ]}
      />
    </Screen>
  )
}
