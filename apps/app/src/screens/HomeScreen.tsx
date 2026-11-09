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
import { type FollowingFeedPage, ProjectId } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../accounts/session'
import { useMemberSession } from '../accounts/session'
import { useFeedNews, useFollowingFeed, useMarkFeedRead } from '../feed/api'
import { FeedError, FeedList, FeedNews } from '../feed/FeedList'
import { FeedSide } from '../feed/FeedSide'
import { FirstRun } from '../feed/FirstRun'
import { firstOfOthers } from '../feed/items'
import { useReadBefore } from '../feed/readBefore'
import { useOpenOutside } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { useMe } from '../profile/hooks'
import { PublishTargetContext } from '../projects/SummaryCard'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { Constellation } from '../ui/Constellation'
import type { Measurable } from '../ui/coverTransition'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HiddenHeading } from '../ui/HiddenHeading'
import { Hint } from '../ui/Hint'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Logo } from '../ui/Logo'
import { PublishDance } from '../ui/PublishDance'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { useScreenFocused } from '../ui/screenFocus'
import { ScreenScrollContext } from '../ui/scrollLight'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useToast } from '../ui/theme/toast'
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
  const viewerId = session.user.id
  // R6a : ses propres projets sont dans son fil, mais jamais une nouveauté pour lui.
  const news = useFeedNews('following', items[0], false, viewerId)
  // Le fil est marqué lu jusqu'au premier élément de la première page, dès qu'il s'affiche (R4) ;
  // R6a : le premier élément d'un autre, jamais un des siens (voir feed/api.ts).
  useMarkFeedRead(firstOfOthers(firstPage?.items, viewerId))
  // R6a : arrivé de la feuille de publication (?published=<id>), la danse vers la nouvelle carte.
  const published = usePublishedArrival(feed, viewerId)
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
    // La carte du projet tout juste publié donne sa vue à la danse (projects/SummaryCard.tsx).
    <PublishTargetContext.Provider value={published.target}>
      <Screen
        width="page"
        // R6a : la danse de publication, par-dessus tout l'écran.
        overlay={published.dance ? <PublishedDance {...published.dance} /> : null}
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
            side={
              <FeedSide withSuggestions={firstRun === false} shownProjectIds={shownProjectIds} />
            }
          />
        ) : (
          main
        )}
      </Screen>
    </PublishTargetContext.Provider>
  )
}

/** Ce que reçoit la danse : la carte à viser (sa vue, mesurée au fil de la danse) et sa fin. */
type DanceProps = { id: string; cover: RefObject<Measurable | null>; onDone: () => void }

/**
 * Hook (R6a, planche R6-Danse) : arrivé de la feuille de publication avec `?published=<id>`, le fil
 * montre la danse de l'abeille vers la nouvelle carte, puis l'avis « Projet publié » (avec la
 * mascotte), puis l'adresse est nettoyée : recharger la page ne rejoue rien.
 *
 * Les gardes, dans l'ordre :
 * - l'adresse n'est lue qu'après l'hydratation (web : la page pré-rendue ne la connaît pas) ;
 * - rien ne se passe tant que l'écran n'est pas la page affichée : la feuille de publication,
 *   posée par-dessus le fil, doit être partie (relecture du plan, ui-I11) ;
 * - le paramètre n'est cru que si c'est un identifiant de projet, et que la première page du fil
 *   contient ce projet, publié par le membre lui-même (relecture du plan, sec-A7). Sinon l'adresse
 *   est nettoyée sans rien montrer. Le fil gardé en mémoire peut dater d'avant la publication : il
 *   est relu une fois avant de conclure.
 *
 * Correction C2 (relecture de design de R6a, B1) : en publiant, la feuille demande déjà au cache de
 * relire le fil (`invalidateQueries`, ProjectFormScreen). Cette lecture en route, on la laisse
 * finir : la relancer l'annulait, et l'accueil, redessiné entre-temps (les nouveautés relues en
 * même temps), concluait sur la page d'avant la publication. « Projet publié » manquait alors une
 * fois sur deux. Une lecture annulée ne vaut donc pas un refus : on ne décide que sur une page
 * arrivée, quand plus aucune lecture n'est en route.
 */
const usePublishedArrival = (feed: ReturnType<typeof useFollowingFeed>, viewerId: string) => {
  const { t } = useTranslation()
  const router = useRouter()
  const toast = useToast()
  const hydrated = useHydrated()
  const focused = useScreenFocused()
  const asked = usePublishedParam()
  const firstPage = feed.data?.pages[0]
  // Lus pendant le rendu (et pas seulement dans l'effet) : React Query ne redessine l'écran que
  // pour les champs qu'il a vu lire, et l'effet doit repasser quand une lecture s'achève.
  const { isFetching, isError, refetch } = feed
  // L'état du moment, pour la fin de la danse, qui arrive plus tard : un `ref` se lit toujours à
  // jour, sans relancer d'effet.
  const latest = useRef({ focused })
  latest.current = { focused }

  // Le projet dont la danse a lieu, et la vue de sa carte, que la carte donne d'elle-même.
  const [dancing, setDancing] = useState<string | null>(null)
  const cover = useRef<Measurable | null>(null)
  const onCover = useCallback((node: Measurable | null) => {
    cover.current = node
  }, [])
  // L'identifiant déjà traité (dansé ou écarté), et celui dont le fil a déjà été relu : chacun une
  // fois, même si l'écran se redessine avant que l'adresse soit nettoyée. `rereadDone` : la
  // relecture de cet identifiant a abouti (un état, et pas un `ref` : sa fin relance l'effet).
  const handled = useRef<string | null>(null)
  const reread = useRef<string | null>(null)
  const [rereadDone, setRereadDone] = useState<string | null>(null)
  // La danse finie (ou l'adresse écartée) pendant que l'écran était caché : nettoyée au retour.
  const [cleanLater, setCleanLater] = useState(false)

  const clean = useCallback(() => {
    // Sans le paramètre, l'adresse redevient celle du fil. `setParams` garde l'historique tel quel.
    if (router.setParams) router.setParams({ published: undefined })
    else router.replace('/')
  }, [router])

  useEffect(() => {
    if (!hydrated || !focused || !asked || handled.current === asked) return
    const isMine = (page: FollowingFeedPage | undefined) =>
      page?.items.some(
        (item) =>
          item.kind === 'project' &&
          item.project.id === asked &&
          item.project.author.id === viewerId,
      ) ?? false
    const decide = (page: FollowingFeedPage | undefined) => {
      if (handled.current === asked) return
      handled.current = asked
      if (isMine(page)) setDancing(asked)
      else clean()
    }
    if (!ProjectId.safeParse(asked).success) {
      decide(undefined)
      return
    }
    // Le fil n'est pas encore là : on attend sa première page (une panne, elle, écarte l'adresse).
    if (!firstPage) {
      if (isError && !isFetching) decide(undefined)
      return
    }
    if (isMine(firstPage)) {
      decide(firstPage)
      return
    }
    // Une lecture du fil est en route (celle que la feuille a demandée en publiant, ou la nôtre) :
    // on attend sa page ; l'effet repasse dès qu'elle arrive.
    if (isFetching) return
    // Le fil a été relu et le projet n'y est toujours pas : l'adresse est écartée.
    if (rereadDone === asked) {
      decide(firstPage)
      return
    }
    // La relecture vient de partir ; sa fin relance l'effet.
    if (reread.current === asked) return
    // Absent de la page gardée en mémoire : le fil est relu une fois, puis on décide.
    // `cancelRefetch: false` : si une lecture part entre-temps, on la rejoint au lieu de l'annuler.
    reread.current = asked
    Promise.resolve(refetch({ cancelRefetch: false }))
      .catch(() => undefined)
      .finally(() => setRereadDone(asked))
  }, [
    hydrated,
    focused,
    asked,
    firstPage,
    isFetching,
    isError,
    refetch,
    rereadDone,
    viewerId,
    clean,
  ])

  // Le retour sur l'accueil après une danse finie ailleurs : l'adresse est nettoyée, sans avis.
  useEffect(() => {
    if (!cleanLater || !focused) return
    setCleanLater(false)
    clean()
  }, [cleanLater, focused, clean])

  const onDone = useCallback(() => {
    setDancing(null)
    // L'avis seulement si l'accueil est encore la page affichée : sinon il parlerait d'un fil
    // qu'on ne voit plus. Le toast est lu par les lecteurs d'écran (ui/theme/toast.tsx).
    if (!latest.current.focused) {
      setCleanLater(true)
      return
    }
    toast.show(
      t(($) => $.project.form.published),
      { mascot: 'fly' },
    )
    clean()
  }, [toast, t, clean])

  const target = useMemo(() => (dancing ? { id: dancing, onCover } : null), [dancing, onCover])
  return { target, dance: dancing ? { id: dancing, cover, onDone } : null }
}

/**
 * Hook : le paramètre `published` de l'adresse. Hors d'un navigateur (un test qui remplace
 * expo-router par un faux sans cette fonction), il n'y en a pas : l'appel lève une erreur, et
 * l'aide répond « rien ». Même raisonnement que navigation/TopNav.tsx : l'issue du try est la même à
 * chaque rendu, React compte donc toujours les mêmes hooks.
 */
const usePublishedParam = (): string | undefined => {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir ci-dessus)
    return firstParam(useLocalSearchParams<{ published?: string | string[] }>().published)
  } catch {
    return undefined
  }
}

/**
 * La danse (R6a), posée par Screen par-dessus l'écran (`overlay`) : elle remonte d'abord le fil en
 * haut (le canal du défilement de Screen, `toTop()`), puis l'abeille part vers la carte.
 *
 * La carte visée, la danse la mesure elle-même pendant son huit (`aim`, ui/PublishDance.tsx) : la
 * danse couvre tout l'écran, dont le coin haut gauche est celui de la fenêtre (ui/Screen.tsx,
 * `overlay`), et l'abeille se pose sur le coin haut gauche de la carte, là où est sa catégorie.
 */
function PublishedDance({ id, cover, onDone }: DanceProps) {
  const scroll = useContext(ScreenScrollContext)
  const [playing, setPlaying] = useState(false)

  // Une danse par projet : remonter, puis danser. La clé `id` la relance pour une autre publication.
  useEffect(() => {
    if (!id) return
    scroll?.toTop()
    setPlaying(true)
  }, [id, scroll])

  return <PublishDance playing={playing} target={null} aim={cover} onDone={onDone} />
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
