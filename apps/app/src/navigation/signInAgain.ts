// Le lien « Me reconnecter », posé à côté de « Ta session a expiré » (tranche 6c) : quand une
// action échoue parce que la session a expiré, réessayer ne sert à rien, il faut se reconnecter.
// Le lien mène à la connexion, qui ramène ensuite sur la page où l'on était (?next=, filtré par
// safeNext dans next.ts), comme le bouton « Me connecter » de SignedOutScreen.
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import type { NoticeAction } from '../ui/Notice'
import { safeNext } from './next'

/**
 * Les paramètres de l'adresse affichée (« ?announce=testable »), sur le web, au moment du toucher.
 * Lus dans le navigateur à cet instant, et non pendant le dessin : la page pré-rendue ne les
 * connaît pas (voir ui/theme/hydration.ts). Sur téléphone, il n'y a pas de barre d'adresse : rien.
 */
const currentQuery = (): string => {
  if (Platform.OS !== 'web') return ''
  return (globalThis as { location?: { search?: string } }).location?.search ?? ''
}

/**
 * Hook : l'action « Me reconnecter », prête à passer à un composant (`errorAction`) ou à une
 * Notice (`action`). `before` sert à refermer ce qui doit l'être avant de partir (une fenêtre de
 * confirmation, qui resterait sinon par-dessus la page de connexion).
 */
export const useSignInAgain = () => {
  const { t } = useTranslation()
  const router = useRouter()
  // usePathname : le chemin de la page affichée (« /projects/abc »), sans ses paramètres.
  const pathname = usePathname()
  return (before?: () => void): NoticeAction => ({
    label: t('states.signIn'),
    onPress: () => {
      before?.()
      // Le retour garde les paramètres de l'adresse, si la page de connexion les accepte (même
      // filtre, safeNext) ; sinon, on revient au moins sur la page, sans eux.
      const query = currentQuery()
      const withQuery = `${pathname}${query}`
      const next = query && safeNext(withQuery) ? withQuery : pathname
      // push (et non replace) : le retour depuis la connexion ramène aussi sur cette page.
      router.push({ pathname: '/sign-in', params: { next } })
    },
  })
}
