// Les états communs à tous les écrans qui chargent quelque chose : le chargement, la page réservée
// aux membres, l'erreur et la page introuvable. Chaque écran les assemble de la même façon, avec
// toujours une issue (réessayer, revenir, se connecter), au lieu d'un titre seul sur une page vide.
import { type Href, usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/errors'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { Screen } from '../ui/Screen'
import { StateMessage } from '../ui/StateMessage'

/** Pendant le chargement. */
export function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <Screen pageTitle={t('common.loading')}>
      <StateMessage kind="loading" message={t('common.loading')} />
    </Screen>
  )
}

/**
 * Une page réservée aux membres, vue par un visiteur. « Me connecter » revient ensuite sur cette
 * même page (paramètre `next`, vérifié par la page de connexion : voir navigation/next.ts).
 */
export function SignedOutScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  // usePathname : le chemin de la page affichée (« /members/abc »).
  const pathname = usePathname()
  return (
    <Screen pageTitle={t('states.signedOutTitle')}>
      <StateMessage
        kind="signedOut"
        title={t('states.signedOutTitle')}
        message={t('home.membersOnly')}
        actions={[
          {
            label: t('home.signIn'),
            onPress: () => router.replace({ pathname: '/sign-in', params: { next: pathname } }),
          },
          { label: t('home.signUp'), onPress: () => router.push('/sign-up') },
        ]}
      />
    </Screen>
  )
}

/** La clé du message d'une erreur venue de l'API (« notFound », « rateLimited »…). */
export const errorKey = (error: unknown) => (error instanceof ApiError ? error.key : 'internal')

/**
 * Le chargement a échoué. « Réessayer » relance la demande (`onRetry`, par exemple le `refetch` de
 * React Query) ; « Revenir » ramène à la page précédente, ou à `fallback`.
 */
export function LoadErrorScreen({
  error,
  onRetry,
  fallback = '/',
}: {
  error: unknown
  onRetry: () => void
  fallback?: Href
}) {
  const { t } = useTranslation()
  const back = useGoBack(fallback)
  return (
    <Screen header={<TopNav />} pageTitle={t('states.errorTitle')}>
      <StateMessage
        kind="error"
        title={t('states.errorTitle')}
        message={t(`errors.${errorKey(error)}`)}
        actions={[
          { label: t('common.retry'), onPress: onRetry },
          { label: t('leaving.back'), onPress: back },
        ]}
      />
    </Screen>
  )
}

/** Ce qu'on cherchait n'existe pas (ou n'est pas visible) : retour à l'accueil. */
export function NotFoundState({ title, message }: { title: string; message?: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen header={<TopNav />} pageTitle={title}>
      <StateMessage
        kind="notFound"
        title={title}
        {...(message ? { message } : null)}
        actions={[{ label: t('project.page.home'), onPress: () => router.replace('/') }]}
      />
    </Screen>
  )
}
