// L'écran d'accueil. En React, un écran est une fonction qui renvoie ce qu'il faut afficher (du JSX,
// cette syntaxe qui ressemble à du HTML). React Native traduit ensuite ses éléments en vrais
// éléments iOS, Android ou web.
//
// Deux visages : pour un visiteur, la constellation, le logo et l'invitation à créer un compte ;
// pour un membre connecté, le Fil : les nouveaux projets des personnes suivies et les notes des
// projets suivis (R3 : « Découvrir » est devenu l'onglet Explorer, et les raccourcis « Publier »,
// « Mes projets », « Réglages » sont passés dans la barre d'onglets et la barre du haut). Le fil se
// lit 20 par 20, et un bouton annonce les nouveautés sans jamais faire bouger ce qu'on lit.
//
// R4 (« le fil et les cartes ») : « Tu es à jour » se pose avant le premier élément déjà vu ; un
// membre qui ne suit personne voit le premier lancement (« Ton fil t'attend », proches à suivre) ;
// sur ordinateur, le titre « Fil » porte le bouton des nouveautés à côté de lui, et une colonne de
// droite propose des proches à suivre et des projets qui cherchent des testeurs.

import { sourceUrl } from '@ruche/brand'
import type { FollowingFeedPage } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, type RefObject, useContext, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../accounts/session'
import { useMemberSession } from '../accounts/session'
import { useFeedNews, useFollowingFeed, useMarkFeedRead } from '../feed/api'
import { FeedError, FeedList, FeedNews } from '../feed/FeedList'
import { FeedSide } from '../feed/FeedSide'
import { FirstRun } from '../feed/FirstRun'
import { useReadBefore } from '../feed/readBefore'
import { useOpenOutside } from '../navigation/links'
import { TopNav } from '../navigation/TopNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { Constellation } from '../ui/Constellation'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HiddenHeading } from '../ui/HiddenHeading'
import { Hint } from '../ui/Hint'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Logo } from '../ui/Logo'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { ScreenScrollContext } from '../ui/scrollLight'
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
  return session ? <MemberHome session={session} /> : <VisitorHome />
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

function MemberHome({ session }: { session: SessionData }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass, columns } = useLayout()
  const compact = sizeClass === 'compact'
  // Le nom du salut du premier lancement : celui du profil, comme la barre du haut, ou celui de la
  // session tant que le profil n'est pas lu.
  const me = useMe(true, { retryOnMount: false })
  const name = me.data?.name ?? session.user.name

  // Le fil, lu ici (et pas plus bas) : sur ordinateur, son bouton des nouveautés se pose à côté du
  // titre de la page, que seul cet écran donne à Screen.
  const feed = useFollowingFeed()
  const firstPage = feed.data?.pages[0]
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const news = useFeedNews('following', items[0])
  // Le fil est marqué lu jusqu'au premier élément de la première page, dès qu'il s'affiche (R4).
  useMarkFeedRead(firstPage?.items[0])
  // La date de la dernière lecture, lue sur la première page et figée pour la visite : la sphère
  // « Tu es à jour » ne saute pas quand le fil est relu (voir feed/readBefore.ts).
  const readBefore = useReadBefore(firstPage)
  const firstRun = useFirstRun(firstPage)

  // openSuspension : sur l'accueil, le bandeau d'un compte suspendu s'ouvre déplié. Sur téléphone,
  // la barre du haut ne montre que ce bandeau ; sur ordinateur, elle porte aussi « Publier un
  // projet » (masqué pour un compte suspendu), la cloche et la photo.
  const topNav = <TopNav openSuspension />
  const onExplore = () => router.push('/explore')
  const showNews = () => feed.refetch()
  // Le bouton des nouveautés, avec la phrase qui dit ce que montre le fil quand rien n'est neuf.
  // Sur ordinateur, à côté du titre (la phrase passe en sous-titre) ; sur téléphone, en tête du fil.
  const caption = t(($) => $.feed.followingCaption)
  const newsButton = <FeedNews news={news} onPress={showNews} {...(compact ? { caption } : null)} />
  // RF (ui-5) : le titre « Fil », où le focus revient quand le bouton des nouveautés est touché.
  const feedTitle = useRef<Focusable>(null)

  const main = (
    <FollowingFeed
      feed={feed}
      items={items}
      readBefore={readBefore}
      firstRun={firstRun}
      name={name}
      news={compact ? newsButton : null}
      // Deux colonnes de cartes dès la tablette (768 points) tant que la colonne de droite n'est
      // pas là, comme Explorer (relecture de design de R4, A5) ; une seule quand elle prend la
      // place, jusqu'à l'ordinateur (`wide`), où les deux tiennent à côté d'elle.
      columns={compact || (columns && sizeClass !== 'wide') ? 1 : 2}
      onExplore={onExplore}
    />
  )
  // Les projets déjà en carte dans le fil : la colonne de droite ne les propose pas une seconde fois.
  const shownProjectIds = new Set(
    items.flatMap((item) => (item.kind === 'project' ? [item.project.id] : [])),
  )

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
      // Sur ordinateur, le titre « Fil » (la barre du haut porte déjà le logo et le mot), le bouton
      // des nouveautés à côté de lui (R4, même écart titre → sous-titre qu'Explorer et Outils). Sur
      // téléphone, le logo tient lieu de titre, et l'onglet « Fil » de la barre du bas dit où l'on est.
      title={compact ? undefined : t(($) => $.feed.title)}
      titleRef={feedTitle}
      // RF (ui-5) : quand le titre passe sous la barre fixe, Screen pose le bouton sous elle ; il
      // reste ainsi en vue pendant qu'on descend dans le fil.
      keepAsideInView
      titleAside={
        compact ? undefined : <PinnedNews news={news} onShow={showNews} titleRef={feedTitle} />
      }
      // La phrase qui dit ce que montre le fil ; pas au premier lancement, où le salut et « Ton fil
      // t'attend » le disent déjà, juste en dessous.
      subtitle={compact || firstRun ? undefined : caption}
      pageTitle={t(($) => $.nav.feed)}
    >
      {/* Sur téléphone, le titre « Fil » reste pourtant lu, caché à l'œil (relecture R3) : un lecteur
          d'écran parcourt la page par ses titres, et sans titre de niveau 1 il ne sait pas où il
          est. Posé en tête du contenu, à la place exacte du titre affiché sur ordinateur. */}
      {compact ? <HiddenHeading text={t(($) => $.nav.feed)} /> : null}
      {/* Sur ordinateur (quand les deux colonnes tiennent), la colonne de droite. Sans proches à
          suivre au premier lancement : la colonne principale les montre déjà. */}
      {columns ? (
        <Columns
          main={main}
          side={<FeedSide withSuggestions={firstRun === false} shownProjectIds={shownProjectIds} />}
        />
      ) : (
        main
      )}
    </Screen>
  )
}

/**
 * Le bouton des nouveautés sur ordinateur (RF, ui-5), à côté du titre ou sous la barre fixe. Son
 * toucher relit le fil comme avant, puis remonte en haut (`toTop()` du canal de défilement de
 * Screen : un composant rendu dans Screen le lit par son contexte) et pose le focus sur le titre
 * « Fil », sans faire défiler une seconde fois.
 */
function PinnedNews({
  news,
  onShow,
  titleRef,
}: {
  news: ReturnType<typeof useFeedNews>
  onShow: () => unknown
  titleRef: RefObject<Focusable | null>
}) {
  const scroll = useContext(ScreenScrollContext)
  return (
    <FeedNews
      news={news}
      onPress={() => {
        onShow()
        scroll?.toTop()
        focusWithoutScroll(titleRef.current)
      }}
    />
  )
}

/**
 * Hook : le premier lancement (le membre ne suit personne), décidé sur la première page et gardé
 * pour la visite ; `undefined` tant que cette page n'est pas là.
 *
 * Pourquoi gardé : suivre un proche depuis la liste relit le fil (follows/api.ts). Sans cette
 * mémoire, le premier « Suivre » remplacerait toute la page par le fil, sous le doigt, et l'on ne
 * pourrait plus suivre le deuxième proche de la liste. Le fil arrive alors sous la liste.
 */
const useFirstRun = (firstPage: Pick<FollowingFeedPage, 'followsAnyone'> | undefined) => {
  const [kept, setKept] = useState<boolean | undefined>(undefined)
  if (kept === undefined && firstPage) {
    // Rempli pendant le rendu, comme useReadBefore : aucun rendu intermédiaire sans la décision.
    const next = firstPage.followsAnyone === false
    setKept(next)
    return next
  }
  return kept
}

type FollowingFeedProps = {
  feed: ReturnType<typeof useFollowingFeed>
  items: FollowingFeedPage['items']
  readBefore: string | null | undefined
  firstRun: boolean | undefined
  name: string
  /** Le bouton des nouveautés, en tête du fil (téléphone) ; null quand il est à côté du titre. */
  news: ReactNode
  columns: number
  onExplore: () => void
}

/** Le fil « Abonnements » : les nouveaux projets des personnes suivies, les notes des projets suivis. */
function FollowingFeed({
  feed,
  items,
  readBefore,
  firstRun,
  name,
  news,
  columns,
  onExplore,
}: FollowingFeedProps) {
  // L'écran d'erreur seulement si rien n'est encore affiché : une suite ratée ne doit pas effacer
  // les cartes déjà lues (voir FeedList).
  if (!feed.data) {
    return feed.isError ? (
      <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
    ) : (
      // Le squelette du fil : trois cartes, un seul « Chargement… » pour un lecteur d'écran.
      <SkeletonList count={3} shape="feed" />
    )
  }
  const list = (
    <FeedList
      feed={feed}
      items={items}
      news={news}
      // Pas de message de fil vide : un fil vide finit sur « Tu es à jour ».
      upToDate={{ readBefore: readBefore ?? null, onExplore }}
      columns={columns}
    />
  )
  if (!firstRun) return list
  // Le premier lancement : le salut, les proches à suivre et l'invitation à publier. Le fil, relu
  // après un « Suivre », arrive dessous, sans rien déplacer de ce qu'on touche.
  return (
    <Stack gap="xxl" align="stretch">
      <FirstRun name={name} />
      {items.length > 0 ? list : null}
    </Stack>
  )
}
