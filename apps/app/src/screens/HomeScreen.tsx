// L'écran d'accueil. En React, un écran est une fonction qui renvoie ce qu'il faut afficher (du JSX,
// cette syntaxe qui ressemble à du HTML). React Native traduit ensuite ses éléments en vrais
// éléments iOS, Android ou web.
//
// Deux visages : pour un visiteur, la constellation, le logo et l'invitation à créer un compte ;
// pour un membre connecté, ses raccourcis (publier, ses projets, son compte) puis le fil, en deux
// choix : « Abonnements » (les nouveaux projets des personnes suivies, et les notes des projets
// suivis) et « Découvrir » (tous les
// projets publics, ou ceux qui cherchent des testeurs). Le fil se lit 20 par 20, jusqu'à « Tu es à
// jour », et un bandeau annonce les nouveautés sans jamais faire bouger ce qu'on lit.
import { sourceUrl } from '@ruche/brand'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { type FeedKind, useFeedNews, useFollowingFeed } from '../feed/api'
import { DiscoverFeed, FeedError, FeedList } from '../feed/FeedList'
import { useSuspension } from '../moderation/suspension'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { Button } from '../ui/Button'
import { Constellation } from '../ui/Constellation'
import { Hint } from '../ui/Hint'
import { IconButton } from '../ui/IconButton'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Screen } from '../ui/Screen'
import { Segmented, type SegmentedHandle } from '../ui/Segmented'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { WelcomeHero } from '../ui/WelcomeHero'
import { Wordmark } from '../ui/Wordmark'
import { SessionErrorScreen } from './states'

export function HomeScreen() {
  // Le membre connecté, ou personne ; l'écran se redessine à la connexion / déconnexion. Pendant
  // la lecture de la session, l'accueil des visiteurs (c'est aussi la page pré-rendue du web).
  const { state, session, retry } = useMemberSession()
  // La lecture a échoué (trop de demandes, panne) : peut-être un membre, on ne lui propose pas de
  // créer un compte (voir accounts/session.ts). Pas de « Retour » : il ramènerait ici.
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" withBack={false} />
  return session ? <MemberHome id={session.user.id} name={session.user.name} /> : <VisitorHome />
}

function VisitorHome() {
  // Les « hooks » (fonctions qui commencent par use…) branchent l'écran sur une donnée qui change.
  // useTranslation : donne t() pour traduire, et redessine l'écran quand la langue change.
  const { t } = useTranslation()
  const router = useRouter()
  const openOutside = useOpenOutside()
  // La carte (scène à gauche) des écrans de marque, dès 1 000 points (R2).
  const wide = useLayout().card

  return (
    // Le « miel vif » des moments de marque : sur téléphone, la constellation flotte sur le miel et
    // tout le reste (le nom, l'accroche, les deux portes d'entrée) est posé sur la feuille claire.
    // Sur ordinateur, la scène de gauche (`hero`) la montre déjà : l'ambiance ne la répète pas.
    <Screen
      ambiance="brand"
      scene={<Constellation height={280} />}
      // R2 (relecture de design de R1) : le choix de la langue sur le miel, pas en tête de la
      // feuille ; à 320 × 568, « Créer un compte » remonte ainsi au-dessus du pli.
      header={
        <Row justify="end">
          <LanguageSwitcher compact />
        </Row>
      }
      hero={
        <WelcomeHero
          tagline={t(($) => $.home.tagline)}
          source={{
            note: t(($) => $.home.openSource),
            link: t(($) => $.home.seeCode),
            onPress: () => openOutside(sourceUrl),
          }}
        />
      }
    >
      {/* Sur ordinateur, la scène de gauche montre déjà la constellation et le logo. */}
      {wide ? (
        <Text variant="title3" heading={1}>
          {t(($) => $.home.title)}
        </Text>
      ) : (
        // Sur téléphone, la constellation flotte sur le miel (`scene`) ; la feuille porte le nom.
        <Stack gap="sm">
          <Wordmark size="huge" header={t(($) => $.home.title)} />
          <Text variant="headline" tone="secondary" weight={400}>
            {t(($) => $.home.tagline)}
          </Text>
        </Stack>
      )}
      <Stack gap="md">
        <Button label={t(($) => $.home.signUp)} onPress={() => router.push('/sign-up')} />
        <Button
          label={t(($) => $.home.haveAccount)}
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
      </Stack>
      <Hint icon="lock-simple" text={t(($) => $.home.membersOnly)} />
      {/* Sur téléphone, pas de scène à gauche : le lien vers le code source se place ici. */}
      {wide ? null : (
        <Row gap="xs" justify="center" wrap>
          <Text variant="caption" tone="muted">
            {t(($) => $.home.openSource)}
          </Text>
          <TextLink
            label={t(($) => $.home.seeCode)}
            onPress={() => openOutside(sourceUrl)}
            external
          />
        </Row>
      )}
    </Screen>
  )
}

function MemberHome({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  // Le fil choisi : « Abonnements » d'abord, puis « Découvrir » d'un toucher.
  const [feed, setFeed] = useState<FeedKind>('following')
  const compact = useLayout().sizeClass === 'compact'
  // Le choix du fil, pour y ramener le focus du clavier quand un bouton change de fil.
  const tabs = useRef<SegmentedHandle>(null)
  const discover = () => {
    setFeed('discover')
    // Le bouton touché disparaît avec le fil vide : le focus va sur le choix « Découvrir ».
    requestAnimationFrame(() => tabs.current?.focusChecked())
  }
  const myProjects = () => router.push({ pathname: '/members/[id]', params: { id } })
  // Un compte suspendu (tranche 7c) ne publie plus : « Publier » disparaît ; le reste de l'accueil
  // (ses projets, son compte, le fil) reste. Le bandeau vient de la barre du haut.
  const suspended = useSuspension().suspended
  return (
    // pageTitle null : l'onglet porte le seul nom de l'appli, pas « Bonjour Léa ! ».
    <Screen
      width="page"
      // openSuspension : sur l'accueil, le bandeau d'un compte suspendu s'ouvre déplié.
      header={<TopNav hideNewProject openSuspension />}
      title={t(($) => $.home.greeting, { name })}
      pageTitle={null}
    >
      {/* Sur téléphone, une seule rangée : « Publier » en clair, ses projets et son compte en
          icônes (avec leur nom pour les lecteurs d'écran). Le fil arrive ainsi plus haut. */}
      <Row gap="sm" wrap>
        {/* Sur téléphone, « Publier » tout court (le nom lu reste « Publier un projet ») : la rangée
            tient sur une ligne, même sur un écran de 320 points. */}
        {suspended ? null : (
          <Button
            label={compact ? t(($) => $.home.publishShort) : t(($) => $.home.publish)}
            spokenLabel={t(($) => $.home.publish)}
            icon="plus"
            size="compact"
            onPress={() => router.push('/projects/new')}
          />
        )}
        {compact ? (
          <>
            <IconButton
              icon="squares-four"
              label={t(($) => $.home.myProjects)}
              onPress={myProjects}
            />
            {/* Sur téléphone, pas de barre du haut : la cloche se range avec les raccourcis. */}
            <NotificationBell />
            <IconButton
              icon="user"
              label={t(($) => $.home.account)}
              onPress={() => router.push('/settings')}
            />
          </>
        ) : (
          <>
            <Button
              label={t(($) => $.home.myProjects)}
              variant="secondary"
              icon="squares-four"
              size="compact"
              onPress={myProjects}
            />
            <Button
              label={t(($) => $.home.account)}
              variant="secondary"
              icon="user"
              size="compact"
              onPress={() => router.push('/settings')}
            />
          </>
        )}
      </Row>
      <Segmented
        handle={tabs}
        label={t(($) => $.feed.label)}
        options={[
          { value: 'following', label: t(($) => $.feed.tabs.following), icon: 'users' },
          { value: 'discover', label: t(($) => $.feed.tabs.discover), icon: 'compass' },
        ]}
        value={feed}
        onChange={setFeed}
        // Sur téléphone, les deux choix se partagent la largeur ; plus large, ils gardent leur taille.
        fill={compact}
      />
      {feed === 'following' ? <FollowingFeed onDiscover={discover} /> : <DiscoverFeed />}
    </Screen>
  )
}

/** Le fil « Abonnements » : les nouveaux projets des personnes suivies, les notes des projets suivis. */
function FollowingFeed({ onDiscover }: { onDiscover: () => void }) {
  const { t } = useTranslation()
  const feed = useFollowingFeed()
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const news = useFeedNews('following', items[0])

  // L'écran d'erreur seulement si rien n'est encore affiché : une suite ratée ne doit pas effacer
  // les cartes déjà lues (voir FeedList).
  if (!feed.data) {
    return feed.isError ? (
      <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
    ) : (
      // Le squelette du fil : trois cartes, un seul « Chargement… » pour un lecteur d'écran.
      <SkeletonList count={3} />
    )
  }
  if (items.length === 0) {
    // Ne suivre personne n'est pas une erreur, ni un fil calme : dans les deux cas, on montre où
    // trouver des projets. En blanc : « Publier un projet », plus haut, reste la seule action miel.
    const followsAnyone = feed.data.pages[0]?.followsAnyone
    return (
      <StateMessage
        kind="empty"
        title={followsAnyone ? undefined : t(($) => $.feed.nobodyTitle)}
        message={followsAnyone ? t(($) => $.feed.quiet) : t(($) => $.feed.nobodyBody)}
        actions={[
          { label: t(($) => $.feed.nobodyAction), onPress: onDiscover, variant: 'secondary' },
        ]}
      />
    )
  }
  return (
    <FeedList
      feed={feed}
      items={items}
      news={news}
      empty={t(($) => $.feed.quiet)}
      caption={t(($) => $.feed.followingCaption)}
    />
  )
}
