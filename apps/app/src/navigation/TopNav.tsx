// La barre de navigation des tablettes et ordinateurs : une capsule de verre en haut, avec le logo
// (retour à l'accueil), « Nouveau projet », la cloche des notifications et l'avatar (mon compte). Sur téléphone, elle n'apparaît
// pas : la barre d'onglets du bas arrivera avec le fil (tranche 4).
// « Publier un projet » est un bouton secondaire : l'action principale (en miel) reste celle de la
// page (« Publier », « Tester la démo »). Le formulaire de projet le masque (`hideNewProject`).
// Elle ne montre que des destinations qui existent déjà : pas de lien vers une page à venir.
//
// Tranche 7c : elle porte aussi le bandeau d'un compte suspendu (`SuspensionBanner`), sous la
// capsule. Toutes les pages la posent : le bandeau est ainsi monté une seule fois, jamais écran par
// écran. Sur téléphone, où la capsule n'apparaît pas, la barre ne montre que lui. Un membre suspendu
// n'y trouve plus « Publier un projet ».
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { NotificationBell } from '../notifications/NotificationBell'
import { useMe } from '../profile/hooks'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Pressed } from '../ui/Pressed'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { useLayout } from '../ui/theme/layout'
import { Wordmark } from '../ui/Wordmark'

type Props = {
  /** Masque « Publier un projet » (sur le formulaire de projet, où il n'a pas de sens). */
  hideNewProject?: boolean
  /**
   * Le bandeau de suspension s'ouvre déplié, même déjà vu (l'accueil, décision de Louis du
   * 27/10/2026) ; ailleurs, il est replié dès la deuxième page (SuspensionBanner).
   */
  openSuspension?: boolean
  /**
   * La page des réglages est ouverte (R2) : l'avatar n'y est plus un lien vers elle-même. Il reste
   * dessiné, sans geste ; la colonne des rubriques porte seule le nom « Réglages ».
   */
  inSettings?: boolean
}

export function TopNav({
  hideNewProject = false,
  openSuspension = false,
  inSettings = false,
}: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  const { data: session } = useSession()
  const shown = sizeClass !== 'compact'
  // Le profil est lu sur toutes les largeurs : pour l'avatar de la capsule, et, sur téléphone aussi,
  // pour savoir si le compte est suspendu (le bandeau). Une seule copie en cache pour toute l'appli.
  // retryOnMount: false, pour éviter une boucle. Les écrans de chargement et d'erreur ont chacun
  // leur propre barre : quand « Mon profil » passe de l'un à l'autre, une nouvelle barre apparaît.
  // Par défaut, React Query relance alors la lecture du profil qui vient d'échouer, ce qui efface
  // l'erreur : la page revient à « Chargement… », la lecture échoue, l'erreur remonte une nouvelle
  // barre, et ainsi de suite (une requête par seconde, sans jamais montrer l'erreur). La barre se
  // contente donc du nom de la session tant que le profil manque ; « Réessayer » relance la lecture.
  const me = useMe(Boolean(session), { retryOnMount: false })
  const { suspension } = useSuspension()
  const toSource = useMediaSources(shown)

  if (!session) return null
  const banner = suspension ? (
    // Ailleurs que sur l'accueil, rien d'imposé : le bandeau suit la mémoire de l'appareil.
    <SuspensionBanner suspension={suspension} initiallyOpen={openSuspension ? true : undefined} />
  ) : null
  // Téléphone : pas de capsule ; le bandeau seul, s'il y a lieu.
  if (!shown) return banner
  const name = me.data?.name ?? session.user.name
  const capsule = (
    <Surface variant="glass" radius="pill" padding="sm">
      <Row gap="lg" paddingX="md" justify="between">
        <Wordmark onPress={() => router.push('/')} />
        <Row gap="md">
          {/* Un compte suspendu ne publie plus : le bouton disparaît (l'API refuserait). */}
          {hideNewProject || suspension ? null : (
            <Button
              label={t(($) => $.home.publish)}
              icon="plus"
              size="compact"
              variant="glass"
              onPress={() => router.push('/projects/new')}
            />
          )}
          {/* La cloche des notifications, avec le nombre de nouveautés (tranche 6b). */}
          <NotificationBell />
          {inSettings ? (
            <Avatar name={name} source={toSource(me.data?.avatarUrl)} label={name} size={44} />
          ) : (
            <Pressed label={t(($) => $.home.account)} onPress={() => router.push('/settings')}>
              <Avatar name={name} source={toSource(me.data?.avatarUrl)} label={name} size={44} />
            </Pressed>
          )}
        </Row>
      </Row>
    </Surface>
  )
  if (!banner) return capsule
  return (
    <Stack gap="md">
      {capsule}
      {banner}
    </Stack>
  )
}
