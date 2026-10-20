// Le lien « Me reconnecter », posé à côté de « Ta session a expiré » (tranche 6c) : quand une
// action échoue parce que la session a expiré, réessayer ne sert à rien, il faut se reconnecter.
// Le lien mène à la connexion, qui ramène ensuite sur la page où l'on était (?next=, filtré par
// safeNext dans next.ts), comme le bouton « Me connecter » de SignedOutScreen.
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { NoticeAction } from '../ui/Notice'

/**
 * Hook : l'action « Me reconnecter », prête à passer à un composant (`errorAction`) ou à une
 * Notice (`action`). `before` sert à refermer ce qui doit l'être avant de partir (une fenêtre de
 * confirmation, qui resterait sinon par-dessus la page de connexion).
 */
export const useSignInAgain = () => {
  const { t } = useTranslation()
  const router = useRouter()
  // usePathname : le chemin de la page affichée (« /projects/abc »).
  const pathname = usePathname()
  return (before?: () => void): NoticeAction => ({
    label: t('states.signIn'),
    onPress: () => {
      before?.()
      // push (et non replace) : le retour depuis la connexion ramène aussi sur cette page.
      router.push({ pathname: '/sign-in', params: { next: pathname } })
    },
  })
}
