// L'écran d'accueil. En React, un écran est une fonction qui renvoie ce qu'il faut afficher (du JSX,
// cette syntaxe qui ressemble à du HTML). React Native traduit ensuite ses éléments en vrais
// éléments iOS, Android ou web.
//
// Deux visages : pour un visiteur, la constellation, le logo et l'invitation à créer un compte ;
// pour un membre connecté, le Fil : les nouveaux projets des personnes suivies et les notes des
// projets suivis (R3 : « Découvrir » est devenu l'onglet Explorer, et les raccourcis « Publier »,
// « Mes projets », « Réglages » sont passés dans la barre d'onglets et la barre du haut). Le fil se
// lit 20 par 20, jusqu'à « Tu es à jour », et un bandeau annonce les nouveautés sans jamais faire
// bouger ce qu'on lit.
import { sourceUrl } from '@ruche/brand'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { useFeedNews, useFollowingFeed } from '../feed/api'
import { FeedError, FeedList } from '../feed/FeedList'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { Button } from '../ui/Button'
import { Constellation } from '../ui/Constellation'
import { Hint } from '../ui/Hint'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Logo } from '../ui/Logo'
import { Screen } from '../ui/Screen'
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
  return session ? <MemberHome /> : <VisitorHome />
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
      {/* Sur ordinateur, la scène de gauche montre déjà la constellation et le grand logo ; la
          feuille porte le nom, l'abeille devant le mot « waiggle » (R3, maquette
          R2-Desktop-Connexion). Annoncé comme sur téléphone : « Bienvenue sur Waiggle », titre 1. */}
      {wide ? (
        <Wordmark size="large" logo header={t(($) => $.home.title)} />
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

function MemberHome() {
  const { t } = useTranslation()
  const router = useRouter()
  const compact = useLayout().sizeClass === 'compact'
  // openSuspension : sur l'accueil, le bandeau d'un compte suspendu s'ouvre déplié. Sur téléphone,
  // la barre du haut ne montre que ce bandeau ; sur ordinateur, elle porte aussi « Publier un
  // projet » (masqué pour un compte suspendu), la cloche et la photo.
  const topNav = <TopNav openSuspension />
  return (
    <Screen
      width="page"
      // Sur téléphone (R3, F-Nav10), le haut du Fil : le logo à gauche, à la place de « Bonjour
      // Léa ! », et la cloche à droite ; le bandeau d'une suspension en dessous. Publier, ses
      // projets et ses réglages sont dans la barre d'onglets, en bas (« + » et « Moi »).
      header={
        compact ? (
          <Stack gap="md">
            <Row justify="between" align="center">
              <Logo />
              <NotificationBell />
            </Row>
            {topNav}
          </Stack>
        ) : (
          topNav
        )
      }
      // Sur ordinateur, le titre « Fil » (la barre du haut porte déjà le logo et le mot). Sur
      // téléphone, le logo tient lieu de titre, et l'onglet « Fil » de la barre du bas dit où l'on est.
      title={compact ? undefined : t(($) => $.nav.feed)}
      pageTitle={t(($) => $.nav.feed)}
    >
      {/* Le fil vide mène à l'onglet Explorer, qui a repris « Découvrir ». */}
      <FollowingFeed onExplore={() => router.push('/explore')} />
    </Screen>
  )
}

/** Le fil « Abonnements » : les nouveaux projets des personnes suivies, les notes des projets suivis. */
function FollowingFeed({ onExplore }: { onExplore: () => void }) {
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
    // trouver des projets. En blanc : « Publier » (le « + » de la barre d'onglets, ou le bouton de
    // la barre du haut) reste la seule action miel.
    const followsAnyone = feed.data.pages[0]?.followsAnyone
    return (
      <StateMessage
        kind="empty"
        title={followsAnyone ? undefined : t(($) => $.feed.nobodyTitle)}
        message={followsAnyone ? t(($) => $.feed.quiet) : t(($) => $.feed.nobodyBody)}
        actions={[
          { label: t(($) => $.feed.nobodyAction), onPress: onExplore, variant: 'secondary' },
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
