// La barre de navigation des tablettes et ordinateurs : une capsule de verre en haut, avec le logo
// (retour à l'accueil), « Nouveau projet », la cloche des notifications et l'avatar (mon compte). Sur téléphone, elle n'apparaît
// pas : la barre d'onglets du bas arrivera avec le fil (tranche 4).
// « Publier un projet » est un bouton secondaire : l'action principale (en miel) reste celle de la
// page (« Publier », « Tester la démo »). Le formulaire de projet le masque (`hideNewProject`).
// Elle ne montre que des destinations qui existent déjà : pas de lien vers une page à venir.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { NotificationBell } from '../notifications/NotificationBell'
import { useMe } from '../profile/hooks'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Pressed } from '../ui/Pressed'
import { Row } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { useLayout } from '../ui/theme/layout'
import { Wordmark } from '../ui/Wordmark'

type Props = {
  /** Masque « Publier un projet » (sur le formulaire de projet, où il n'a pas de sens). */
  hideNewProject?: boolean
}

export function TopNav({ hideNewProject = false }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  const { data: session } = useSession()
  const shown = sizeClass !== 'compact'
  // Le profil (pour l'avatar) n'est demandé que si la barre est affichée.
  // retryOnMount: false, pour éviter une boucle. Les écrans de chargement et d'erreur ont chacun
  // leur propre barre : quand « Mon profil » passe de l'un à l'autre, une nouvelle barre apparaît.
  // Par défaut, React Query relance alors la lecture du profil qui vient d'échouer, ce qui efface
  // l'erreur : la page revient à « Chargement… », la lecture échoue, l'erreur remonte une nouvelle
  // barre, et ainsi de suite (une requête par seconde, sans jamais montrer l'erreur). La barre se
  // contente donc du nom de la session tant que le profil manque ; « Réessayer » relance la lecture.
  const me = useMe(Boolean(session) && shown, { retryOnMount: false })
  const toSource = useMediaSources(shown)

  if (!shown || !session) return null
  const name = me.data?.name ?? session.user.name
  return (
    <Surface variant="glass" radius="pill" padding="sm">
      <Row gap="lg" paddingX="md" justify="between">
        <Wordmark onPress={() => router.push('/')} />
        <Row gap="md">
          {hideNewProject ? null : (
            <Button
              label={t('home.publish')}
              icon="plus"
              size="compact"
              variant="glass"
              onPress={() => router.push('/projects/new')}
            />
          )}
          {/* La cloche des notifications, avec le nombre de nouveautés (tranche 6b). */}
          <NotificationBell />
          <Pressed label={t('home.account')} onPress={() => router.push('/account')}>
            <Avatar name={name} source={toSource(me.data?.avatarUrl)} label={name} size={44} />
          </Pressed>
        </Row>
      </Row>
    </Surface>
  )
}
