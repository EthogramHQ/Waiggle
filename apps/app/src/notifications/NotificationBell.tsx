// La cloche des notifications (tranche 6b) : dans la barre du haut sur ordinateur, à côté de
// « Mes projets » sur l'accueil d'un téléphone. Sa pastille dit combien de groupes sont nouveaux
// (« 9+ » au-delà de 9, rien à zéro), et son nom le dit aux lecteurs d'écran
// (« Notifications, 3 nouvelles »). La toucher ouvre l'écran des notifications.
// Elle ne s'affiche que pour un membre connecté : c'est à l'écran qui la porte de le vérifier.
import { UNREAD_COUNT_MAX } from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { CountBadge } from '../ui/CountBadge'
import { IconButton } from '../ui/IconButton'
import { useUnreadCount } from './api'

/** L'API s'arrête à 10, son « plus de 9 » : la pastille écrit donc au plus 9, puis « 9+ ». */
const SHOWN_MAX = UNREAD_COUNT_MAX - 1

export function NotificationBell() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const count = useUnreadCount()
  const label =
    count === 0
      ? t('notifications.bell')
      : count > SHOWN_MAX
        ? t('notifications.bellNewMany')
        : t('notifications.bellNew', { count })
  return (
    <IconButton
      icon="bell"
      label={label}
      // Déjà sur l'écran des notifications : rien à empiler une seconde fois.
      onPress={() => {
        if (pathname !== '/notifications') router.push('/notifications')
      }}
      badge={<CountBadge count={count} max={SHOWN_MAX} />}
    />
  )
}
