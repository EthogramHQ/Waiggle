// La barre de navigation des tablettes et ordinateurs : une capsule de verre en haut, avec le logo
// (retour à l'accueil), « Nouveau projet » et l'avatar (mon compte). Sur téléphone, elle n'apparaît
// pas : la barre d'onglets du bas arrivera avec le fil (tranche 4).
// « Nouveau projet » est un bouton secondaire : l'action principale (en miel) reste celle de la
// page (« Publier », « Tester la démo »). Il disparaît sur le formulaire, où il n'a pas de sens.
// Elle ne montre que des destinations qui existent déjà : pas de lien vers une page à venir.
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { useMe } from '../profile/hooks'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Pressed } from '../ui/Pressed'
import { Row } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { useLayout } from '../ui/theme/layout'
import { Wordmark } from '../ui/Wordmark'

export function TopNav() {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  const pathname = usePathname()
  const { data: session } = useSession()
  const shown = sizeClass !== 'compact'
  // Le profil (pour l'avatar) n'est demandé que si la barre est affichée.
  const me = useMe(Boolean(session) && shown)
  const toSource = useMediaSources(shown)

  if (!shown || !session) return null
  const onForm = pathname === '/projects/new' || pathname.endsWith('/edit')
  const name = me.data?.name ?? session.user.name
  return (
    <Surface variant="glass" radius="pill" padding="sm">
      <Row gap="lg" paddingX="md" justify="between">
        <Wordmark onPress={() => router.push('/')} />
        <Row gap="md">
          {onForm ? null : (
            <Button
              label={t('nav.newProject')}
              icon="plus"
              size="compact"
              variant="glass"
              onPress={() => router.push('/projects/new')}
            />
          )}
          <Pressed label={t('home.account')} onPress={() => router.push('/account')}>
            <Avatar name={name} source={toSource(me.data?.avatarUrl)} label={name} size={44} />
          </Pressed>
        </Row>
      </Row>
    </Surface>
  )
}
