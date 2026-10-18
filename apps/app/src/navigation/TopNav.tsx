// La barre de navigation des grands écrans (ordinateur) : une capsule de verre en haut, avec le
// logo (retour à l'accueil), « Publier » et l'avatar (mon compte). Sur téléphone, elle n'apparaît
// pas : la barre d'onglets du bas arrivera avec le fil (tranche 4).
// Elle ne montre que des destinations qui existent déjà : pas de lien vers une page à venir.
import { useRouter } from 'expo-router'
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
  const { data: session } = useSession()
  // Le profil (pour l'avatar) n'est demandé que si la barre est affichée.
  const me = useMe(Boolean(session) && sizeClass === 'wide')
  const toSource = useMediaSources(sizeClass === 'wide')

  if (sizeClass !== 'wide' || !session) return null
  const name = me.data?.name ?? session.user.name
  return (
    <Surface variant="glass" radius="pill" padding="sm">
      <Row gap="lg" paddingX="md" justify="between">
        <Wordmark onPress={() => router.push('/')} />
        <Row gap="md">
          <Button
            label={t('project.new.submit')}
            icon="plus"
            size="compact"
            onPress={() => router.push('/projects/new')}
          />
          <Pressed label={t('home.account')} onPress={() => router.push('/account')}>
            <Avatar name={name} source={toSource(me.data?.avatarUrl)} label={name} size={44} />
          </Pressed>
        </Row>
      </Row>
    </Surface>
  )
}
