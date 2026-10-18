// L'écran d'accueil. En React, un écran est une fonction qui renvoie ce qu'il faut afficher (du JSX,
// cette syntaxe qui ressemble à du HTML). React Native traduit ensuite ses éléments en vrais
// éléments iOS, Android ou web.
//
// Deux visages : pour un visiteur, la constellation, le logo et l'invitation à créer un compte ;
// pour un membre connecté, en attendant le fil (tranche 4), un accueil qui invite à publier et
// mène à ses projets (sa propre page).
import { sourceUrl } from '@ruche/brand'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { Button } from '../ui/Button'
import { Constellation } from '../ui/Constellation'
import { Icon } from '../ui/Icon'
import { Emblem } from '../ui/Illustrations'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { WelcomeHero } from '../ui/WelcomeHero'
import { Wordmark } from '../ui/Wordmark'

export function HomeScreen() {
  // useSession : le membre connecté, ou null. L'écran se redessine à la connexion / déconnexion.
  const { data: session } = useSession()
  return session ? <MemberHome id={session.user.id} name={session.user.name} /> : <VisitorHome />
}

function VisitorHome() {
  // Les « hooks » (fonctions qui commencent par use…) branchent l'écran sur une donnée qui change.
  // useTranslation : donne t() pour traduire, et redessine l'écran quand la langue change.
  const { t } = useTranslation()
  const router = useRouter()
  const openOutside = useOpenOutside()
  const { sizeClass } = useLayout()
  const wide = sizeClass === 'wide'

  return (
    <Screen
      hero={
        <WelcomeHero
          tagline={t('home.tagline')}
          source={{
            note: t('home.openSource'),
            link: t('home.seeCode'),
            onPress: () => openOutside(sourceUrl),
          }}
        />
      }
    >
      <Row justify="end">
        <LanguageSwitcher compact />
      </Row>
      {/* Sur ordinateur, la scène de gauche montre déjà la constellation et le logo. */}
      {wide ? (
        <Text variant="title3" accessibilityRole="header">
          {t('home.title')}
        </Text>
      ) : (
        <>
          <Constellation height={280} />
          <Stack gap="sm">
            <Wordmark size="huge" header={t('home.title')} />
            <Text variant="headline" tone="secondary" weight={400}>
              {t('home.tagline')}
            </Text>
          </Stack>
        </>
      )}
      <Stack gap="md">
        <Button label={t('home.signUp')} onPress={() => router.push('/sign-up')} />
        <Button
          label={t('home.haveAccount')}
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
      </Stack>
      <Row gap="sm" justify="center">
        <Icon name="lock-simple" size={16} tone="muted" />
        <Text variant="caption" tone="muted" align="center">
          {t('home.membersOnly')}
        </Text>
      </Row>
      {/* Sur téléphone, pas de scène à gauche : le lien vers le code source se place ici. */}
      {wide ? null : (
        <Row gap="xs" justify="center" wrap>
          <Text variant="caption" tone="muted">
            {t('home.openSource')}
          </Text>
          <TextLink label={t('home.seeCode')} onPress={() => openOutside(sourceUrl)} />
        </Row>
      )}
    </Screen>
  )
}

function MemberHome({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    // pageTitle null : l'onglet porte le seul nom de l'appli, pas « Bonjour Léa ! ».
    <Screen header={<TopNav />} title={t('home.greeting', { name })} pageTitle={null}>
      {/* Un état vide qui invite à agir, plutôt qu'une page blanche (voir docs/design/miel.md). */}
      <Surface variant="grouped" padding="xxl" gap="lg">
        <Stack align="center">
          <Emblem icon="sparkle" />
        </Stack>
        <Text variant="heading" align="center">
          {t('home.comingSoon')}
        </Text>
        <Text tone="secondary" align="center">
          {t('home.comingSoonBody')}
        </Text>
        <Button
          label={t('home.publish')}
          icon="plus"
          onPress={() => router.push('/projects/new')}
        />
        <Button
          label={t('home.myProjects')}
          variant="secondary"
          icon="squares-four"
          onPress={() => router.push({ pathname: '/members/[id]', params: { id } })}
        />
        <Button
          label={t('home.account')}
          variant="secondary"
          icon="user"
          onPress={() => router.push('/account')}
        />
      </Surface>
    </Screen>
  )
}
