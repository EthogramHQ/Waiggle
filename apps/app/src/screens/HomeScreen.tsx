// L'écran d'accueil. En React, un écran est une fonction qui renvoie ce qu'il faut afficher (du JSX,
// cette syntaxe qui ressemble à du HTML). React Native traduit ensuite ses éléments en vrais
// éléments iOS, Android ou web.
//
// R12 : le Fil a sa propre adresse (`/feed`), et l'accueil `/` est la vitrine (ShowcaseScreen.tsx).
// Cet écran n'est plus que le Fil d'un membre connecté : les nouveaux projets des personnes suivies
// et les notes des projets suivis. R16 : sans session, « Réservé aux membres », et pendant sa
// lecture, le squelette du Fil (la garde commune, `SessionGate`) ; l'accueil d'un visiteur vit à
// `/` (ShowcaseScreen.tsx) (R3 : « Découvrir » est devenu l'onglet Explorer, et les raccourcis « Publier »,
// « Mes projets », « Réglages » sont passés dans la barre d'onglets et la barre du haut). Le fil se
// lit 20 par 20, et un bouton annonce les nouveautés sans jamais faire bouger ce qu'on lit.
//
// R4 (« le fil et les cartes ») : « Tu es à jour » se pose avant le premier élément déjà vu ; un
// membre qui ne suit personne voit le premier lancement (« Ton fil t'attend », proches à suivre) ;
// sur ordinateur, le titre « Fil » porte le bouton des nouveautés à côté de lui, et une colonne de
// droite propose des proches à suivre et des projets qui cherchent des testeurs.

import {
  type FollowingFeedPage,
  type HiveSummary,
  type HiveInvitation as Invitation,
  ProjectId,
} from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import type { SessionData } from '../accounts/session'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { type FeedNews as News, useFeedNews, useFollowingFeed, useMarkFeedRead } from '../feed/api'
import { FeedError, FeedList, FeedNews, FeedSkeleton } from '../feed/FeedList'
import { FeedSide, FeedSideSkeleton } from '../feed/FeedSide'
import { FirstRun } from '../feed/FirstRun'
import { firstOfOthers } from '../feed/items'
import { useReadBefore } from '../feed/readBefore'
import {
  hiveFeedQueryKey,
  useAcceptInvitation,
  useHiveFeed,
  useMyHives,
  useRefuseInvitation,
} from '../hives/api'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { useMe } from '../profile/hooks'
import { PublishTargetContext } from '../projects/SummaryCard'
import { Columns } from '../ui/Columns'
import type { Measurable } from '../ui/coverTransition'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HiddenHeading } from '../ui/HiddenHeading'
import { HiveInvitation } from '../ui/HiveInvitation'
import { ALL_HIVES, HivePills } from '../ui/HivePills'
import { Logo } from '../ui/Logo'
import { Notice } from '../ui/Notice'
import { PublishDance } from '../ui/PublishDance'
import { Reveal } from '../ui/Reveal'
import { Screen } from '../ui/Screen'
import { LoadingShownContext } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { useScreenFocused } from '../ui/screenFocus'
import { ScreenScrollContext } from '../ui/scrollLight'
import { TabPanel } from '../ui/Tabs'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useToast, useToastShown } from '../ui/theme/toast'

export function HomeScreen() {
  // R16 (plan, choix 14 ; sécurité, plan 2, A1) : la garde de session commune. Pendant la lecture
  // de la session (c'est aussi la page pré-rendue du web), le squelette du Fil, jamais l'accueil
  // des visiteurs, qui apparaîtrait un instant à un membre ; un visiteur lit « Réservé aux
  // membres » (l'accueil des visiteurs vit à `/`) ; une lecture ratée (trop de demandes, panne)
  // propose « Réessayer », sans « Retour » : il ramènerait ici.
  //
  // Un seul squelette (scénario : « Le Fil n'a plus qu'un squelette, au lieu de deux qui se
  // suivent ») : celui de la session s'est-il montré ? Le Fil qui prend sa suite montre alors le
  // sien tout de suite, aux mêmes places, sans les 160 ms où `Loading` reste invisible (les cartes
  // vides disparaîtraient un instant). Un `ref` : le savoir ne redessine rien.
  const sessionSkeletonShown = useRef(false)
  const onSessionSkeletonShown = useCallback(() => {
    sessionSkeletonShown.current = true
  }, [])
  return (
    <SessionGate
      width="page"
      withBack={false}
      loading={
        <LoadingShownContext.Provider value={onSessionSkeletonShown}>
          <FeedWaiting />
        </LoadingShownContext.Provider>
      }
    >
      {(session) => <MemberHome session={session} skeletonShown={sessionSkeletonShown.current} />}
    </SessionGate>
  )
}

/** Un geste qui ne fait rien : la place vide du bouton des nouveautés, dans le squelette. */
const noop = () => undefined

/**
 * Le haut du Fil. Sur téléphone (R3, F-Nav10) : le logo à gauche, à la place de « Bonjour Léa ! »,
 * et la cloche à droite ; le bandeau d'une suspension en dessous. Publier, ses projets et ses
 * réglages sont dans la barre d'onglets, en bas (« + » et « Moi »). Sur ordinateur, la barre du haut.
 * `bell` faux pendant la lecture de la session : la cloche lirait l'API sans savoir qui la lit (le
 * logo, plus haut qu'elle, tient seul la hauteur de la rangée).
 */
function FeedHeader({ compact, bell }: { compact: boolean; bell: boolean }) {
  // openSuspension : sur l'accueil, le bandeau d'un compte suspendu s'ouvre déplié. Sur téléphone,
  // la barre du haut ne montre que ce bandeau ; sur ordinateur, elle porte aussi « Publier un
  // projet » (masqué pour un compte suspendu), la cloche et la photo.
  const topNav = <TopNav openSuspension />
  if (!compact) return topNav
  return (
    <Stack gap="md">
      <Row justify="between" align="center">
        <Logo />
        {bell ? <NotificationBell /> : null}
      </Row>
      {topNav}
    </Stack>
  )
}

/**
 * R16 : le Fil pendant la lecture de la session, aux places du Fil qui arrive (planches R16-Fil) :
 * la même page large, le même haut, la place vide du bouton des nouveautés, quatre cartes vides
 * dans les colonnes du Fil et, sur ordinateur, la colonne avec ses vrais titres et ses lignes vides.
 * Rien n'y lit l'API : on ne sait pas encore qui regarde.
 */
function FeedWaiting() {
  const { t } = useTranslation()
  const { sizeClass, columns } = useLayout()
  const compact = sizeClass === 'compact'
  const panelId = useId()
  const idleNews = <FeedNews news={NO_NEWS} onPress={noop} />
  // Le filtre : « Tout », puis les pastilles vides des ruches, tant qu'on ne les connaît pas (voir
  // MemberHome).
  const main = (
    <TabPanel id={panelId} label={t(($) => $.hives.pills.all)}>
      <FeedSkeleton news={compact ? idleNews : null} />
    </TabPanel>
  )
  return (
    <Screen
      width="wide"
      header={<FeedHeader compact={compact} bell={false} />}
      title={compact ? undefined : t(($) => $.feed.title)}
      titleHidden
      keepAsideInView
      titleAside={compact ? undefined : idleNews}
      pageTitle={t(($) => $.nav.feed)}
      sticky={
        <>
          {compact ? <HiddenHeading text={t(($) => $.nav.feed)} /> : null}
          <HivePills hives={[]} value={ALL_HIVES} onChange={noop} panelId={panelId} waiting />
        </>
      }
    >
      {columns ? (
        <Columns sideWidth="panel" sticky main={main} side={<FeedSideSkeleton />} />
      ) : (
        main
      )}
    </Screen>
  )
}

function MemberHome({
  session,
  skeletonShown,
}: {
  session: SessionData
  /** Le squelette de la lecture de la session s'est montré : le Fil montre le sien tout de suite. */
  skeletonShown: boolean
}) {
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
  // R10 : la pastille choisie (« Tout », ou une de ses ruches), et ses invitations.
  const hiveChoice = useHiveChoice()
  const { chosen } = hiveChoice
  // R6a : ses propres projets sont dans son fil, mais jamais une nouveauté pour lui.
  const followingNews = useFeedNews('following', items[0], false, viewerId)
  // R10 (relecture) : sous la pastille d'une ruche, le bouton des nouveautés de cette ruche, lu dans
  // « mes ruches » (voir hiveNewsOf). L'état du Fil de la ruche se lit dans le cache, sans hook : cet
  // écran se redessine quand « mes ruches » sont relues, juste après chaque page de ce Fil.
  const queryClient = useQueryClient()
  const hiveFeedKey = chosen ? hiveFeedQueryKey(chosen.id) : undefined
  const hiveFeedState = hiveFeedKey ? queryClient.getQueryState(hiveFeedKey) : undefined
  const news = chosen ? hiveNewsOf(chosen, hiveChoice.read, hiveFeedState) : followingNews
  // Le fil est marqué lu jusqu'au premier élément de la première page, dès qu'il s'affiche (R4) ;
  // R6a : le premier élément d'un autre, jamais un des siens (voir feed/api.ts). R10 : seulement
  // quand il s'affiche, sous « Tout » : le Fil d'une ruche a sa propre date, que sa lecture avance.
  useMarkFeedRead(chosen ? undefined : firstOfOthers(firstPage?.items, viewerId))
  // R6a : arrivé de la feuille de publication (?published=<id>), la danse vers la nouvelle carte.
  const published = usePublishedArrival(feed, viewerId)
  // La date de la dernière lecture, lue sur la première page et figée pour la visite : la sphère
  // « Tu es à jour » ne saute pas quand le fil est relu (voir feed/readBefore.ts).
  const readBefore = useReadBefore(firstPage)
  const firstRun = useFirstRun(firstPage)
  // La colonne principale attend : ses ruches (une ruche demandée par l'adresse : on ne montre pas
  // « Tout » pour le remplacer aussitôt ; sans elle, les pastilles arrivées après le Fil
  // s'inséraient au-dessus des cartes, relecture du design de R10), puis « Tout ». Le Fil d'une
  // ruche attend dans HiveFeed, qui le lit. Une lecture ratée ne retient rien : son message prend la
  // place.
  const mainLoading = hiveChoice.waiting || (!chosen && !feed.data && !feed.isError)
  // Un squelette est à l'écran, et le suivant prend sa place : celui de la session, puis celui du
  // Fil ; ou celui des ruches, puis celui du Fil de la ruche demandée. Le suivant se montre alors
  // tout de suite, sans les 160 ms où `Loading` reste invisible (les cartes vides disparaîtraient un
  // instant). Retombé une fois la colonne arrivée (dans un effet : le squelette suivant, monté par
  // ce rendu-là, l'a déjà lu) ; une pastille choisie plus tard repart de l'attente ordinaire.
  const [continued, setContinued] = useState(skeletonShown)
  const onMainSkeletonShown = useCallback(() => setContinued(true), [])
  useEffect(() => {
    if (!mainLoading) setContinued(false)
  }, [mainLoading])

  const onExplore = () => router.push('/explore')
  // Afficher les nouveautés : relire le fil montré (« Tout », ou celui de la ruche choisie).
  const showNews = () =>
    hiveFeedKey ? queryClient.refetchQueries({ queryKey: hiveFeedKey }) : feed.refetch()
  // Le bouton des nouveautés : sur ordinateur, à côté du titre ; sur téléphone, en tête du fil.
  // R11 (« Moins de mots ») : plus de phrase qui dit ce que montre le fil (le titre « Fil » et la
  // pastille choisie le disent ; d'où vient le fil est écrit dans les Règles). Quand rien n'est
  // neuf, la place du bouton reste réservée, vide (ui/NewItemsBanner.tsx) : le fil ne bouge pas
  // quand le bouton arrive.
  const newsButton = <FeedNews news={news} onPress={showNews} />
  // RF (ui-5) : le titre « Fil », où le focus revient quand le bouton des nouveautés est touché.
  const feedTitle = useRef<Focusable>(null)
  // R15 (« Des colonnes qui suivent la place ») : l'écran ne compte plus les colonnes de cartes.
  // La grille (ui/ProjectGrid) lit la largeur de la colonne où elle est posée, que `Screen` et
  // `Columns` lui publient, et y met autant de cartes qu'il en tient : une sur téléphone, deux sur
  // tablette, une à côté du panneau sur une petite fenêtre d'ordinateur, deux à 1 100, trois à
  // 1 440 et à 1 920 (planche R15-Fil-1920).

  // R10 : les pastilles, seulement pour un membre d'au moins une ruche. Elles commandent le
  // panneau du Fil (`panelId`), posé autour de la colonne principale. R16 (planches R16-Fil) : le
  // filtre est déjà là pendant la lecture de ses ruches : le vrai onglet « Tout », qui commande
  // déjà le Fil, puis les pastilles vides des ruches à venir (`waiting`). Les cartes ne descendent
  // plus quand ses ruches arrivent (69 points sur téléphone), et la rangée garde sa largeur (seul,
  // « Tout » laissait la bande trop étroite pour les noms, qui passaient un instant à la ligne :
  // le Fil descendait de 27 points puis remontait, à 1 440 comme à 2 560). Sans ruche, il part.
  const panelId = useId()
  const pills =
    hiveChoice.hives.length > 0 || hiveChoice.waiting ? (
      <HivePills
        hives={hiveChoice.hives}
        value={chosen?.id ?? ALL_HIVES}
        onChange={hiveChoice.choose}
        panelId={panelId}
        waiting={hiveChoice.waiting}
      />
    ) : null
  // Sur téléphone, le titre « Fil » reste pourtant lu, caché à l'œil (relecture R3) : un lecteur
  // d'écran parcourt la page par ses titres, et sans titre de niveau 1 il ne sait pas où il est.
  // Posé en tête, à la place exacte du titre affiché sur ordinateur : avant les pastilles quand
  // elles sont là (la place collée de Screen passe avant le contenu), sinon en tête du contenu.
  const hiddenTitle = compact ? <HiddenHeading text={t(($) => $.nav.feed)} /> : null

  const main = (
    <TabPanel
      id={pills ? panelId : undefined}
      label={chosen ? (chosen.name ?? t(($) => $.hives.unnamed)) : t(($) => $.hives.pills.all)}
    >
      {/* R16 : un seul squelette pour toute l'attente (ses ruches, puis le Fil montré), qui fond
          vers le Fil quand il arrive (`Reveal`, 180 ms). */}
      <Reveal
        loading={mainLoading}
        skeleton={
          <NoteShown onShown={onMainSkeletonShown}>
            <FeedSkeleton news={compact ? newsButton : null} shown={continued} />
          </NoteShown>
        }
      >
        {chosen ? (
          // Une liste neuve par ruche (`key`) : sa date « Tu es à jour » et sa mémoire des cartes
          // déjà vues sont celles de cette ruche.
          <HiveFeed
            key={chosen.id}
            hiveId={chosen.id}
            skeletonShown={continued}
            news={compact ? newsButton : null}
            onExplore={onExplore}
            hideMascot={published.noticeUp}
          />
        ) : (
          <FollowingFeed
            feed={feed}
            items={items}
            readBefore={readBefore}
            firstRun={firstRun}
            name={name}
            news={compact ? newsButton : null}
            onExplore={onExplore}
            hideMascot={published.noticeUp}
            // Toujours posé (il ne dessine rien sans invitation) : une invitation refusée garde sa
            // place jusqu'à la prochaine visite, même quand la liste relue ne l'a plus.
            invitations={<FeedInvitations invitations={hiveChoice.invitations} />}
          />
        )}
      </Reveal>
    </TabPanel>
  )
  // Les projets déjà en carte dans le fil : la colonne de droite ne les propose pas une seconde fois.
  const shownProjectIds = new Set(
    items.flatMap((item) => (item.kind === 'project' ? [item.project.id] : [])),
  )

  return (
    // La carte du projet tout juste publié donne sa vue à la danse (projects/SummaryCard.tsx).
    <PublishTargetContext.Provider value={published.target}>
      <Screen
        // R15 : le gabarit large, celui des écrans de cartes. Sous 1 280 points, c'est la largeur
        // d'une page ordinaire ; au-delà, le Fil prend presque toute la fenêtre (1 728 à 1 920), et
        // la barre du haut suit la même largeur.
        width="wide"
        // R6a : la danse de publication, par-dessus tout l'écran.
        overlay={published.dance ? <PublishedDance {...published.dance} /> : null}
        header={<FeedHeader compact={compact} bell />}
        // Sur ordinateur, le titre « Fil » n'est plus affiché (« Moins de mots », 16/11/2026 : l'onglet
        // allumé de la barre du haut le dit déjà) ; il reste le titre de niveau 1 lu, et le focus s'y
        // pose toujours (`titleRef`). Le bouton des nouveautés et les pastilles des ruches passent en
        // haut à droite du contenu. Sur téléphone, le logo tient lieu de titre, et l'onglet « Fil »
        // de la barre du bas dit où l'on est.
        title={compact ? undefined : t(($) => $.feed.title)}
        titleHidden
        titleRef={feedTitle}
        // RF (ui-5) : quand le titre passe sous la barre fixe, Screen pose le bouton sous elle ; il
        // reste ainsi en vue pendant qu'on descend dans le fil.
        keepAsideInView
        titleAside={
          compact ? undefined : <PinnedNews news={news} onShow={showNews} titleRef={feedTitle} />
        }
        pageTitle={t(($) => $.nav.feed)}
        // R10 : les pastilles des ruches, sous l'en-tête. Sur téléphone, Screen les garde collées en
        // haut pendant le défilement ; sur tablette et ordinateur, à droite du titre « Fil ».
        // Relecture du design de R10 : `null` (et non `undefined`) tant qu'elles ne sont pas là. La
        // place existe déjà, vide : quand les ruches arrivent après le Fil, Screen garde le même
        // arbre, et le Fil n'est pas remonté (le focus du clavier restait sur toute la page).
        sticky={
          pills ? (
            <>
              {hiddenTitle}
              {pills}
            </>
          ) : null
        }
      >
        {pills ? null : hiddenTitle}
        {/* Sur ordinateur (quand les deux colonnes tiennent), la colonne de droite. Sans proches à
          suivre au premier lancement : la colonne principale les montre déjà.
          R15 : le panneau a sa largeur fixe (`panel`, 340), le Fil prend tout le reste ; il reste
          en place pendant qu'on descend dans le Fil (`sticky`), sous la barre du haut, s'il tient
          dans la fenêtre (sinon il défile avec la page : son bas doit rester atteignable). */}
        {columns ? (
          <Columns
            sideWidth="panel"
            sticky
            main={main}
            side={
              <FeedSide
                // R16 : « Proches à suivre » garde sa place pendant que le Fil charge (le cas
                // ordinaire : le membre suit déjà quelqu'un) ; il part au premier lancement, où la
                // colonne principale les montre déjà.
                withSuggestions={firstRun !== true}
                shownProjectIds={shownProjectIds}
                skeletonShown={continued}
              />
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
  // H1 (relecture de design de R6a) : l'avis « Projet publié » porte sa mascotte et se posait sur
  // l'abeille de « Tu es à jour » à 390 points. `noticeUp` vaut vrai de l'instant où cet avis part
  // jusqu'à sa disparition ; la liste cache alors l'abeille endormie. Le toast est posé dans le même
  // geste que `setNoticeUp` : React les groupe, `toastShown` est donc déjà vrai au rendu suivant.
  const toastShown = useToastShown()
  const [noticeUp, setNoticeUp] = useState(false)
  useEffect(() => {
    if (noticeUp && !toastShown) setNoticeUp(false)
  }, [noticeUp, toastShown])

  const clean = useCallback(() => {
    // Sans le paramètre, l'adresse redevient celle du fil. `setParams` garde l'historique tel quel.
    if (router.setParams) router.setParams({ published: undefined })
    else router.replace('/feed')
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
    setNoticeUp(true)
    clean()
  }, [toast, t, clean])

  const target = useMemo(() => (dancing ? { id: dancing, onCover } : null), [dancing, onCover])
  return { target, dance: dancing ? { id: dancing, cover, onDone } : null, noticeUp }
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
  onExplore: () => void
  /** L'avis « Projet publié » est à l'écran : l'abeille de « Tu es à jour » s'efface (H1). */
  hideMascot: boolean
  /** R10 : ses invitations dans une ruche, montrées au premier lancement seulement. */
  invitations: ReactNode
}

/** Le fil « Abonnements » : les nouveaux projets des personnes suivies, les notes des projets suivis. */
function FollowingFeed({
  feed,
  items,
  readBefore,
  firstRun,
  name,
  news,
  onExplore,
  hideMascot,
  invitations,
}: FollowingFeedProps) {
  // L'écran d'erreur seulement si rien n'est encore affiché : une suite ratée ne doit pas effacer
  // les cartes déjà lues (voir FeedList). R16 : l'attente est le squelette de MemberHome (`Reveal`),
  // posé à la place de ce composant ; rien ici en attendant.
  if (!feed.data) {
    return feed.isError ? (
      <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
    ) : null
  }
  const list = (
    <FeedList
      feed={feed}
      items={items}
      news={news}
      // Pas de message de fil vide : un fil vide finit sur « Tu es à jour ».
      upToDate={{ readBefore: readBefore ?? null, onExplore, hideMascot }}
    />
  )
  if (!firstRun) return list
  // Le premier lancement : le salut, les proches à suivre et l'invitation à publier. Le fil, relu
  // après un « Suivre », arrive dessous, sans rien déplacer de ce qu'on touche.
  return (
    <Stack gap="xxl" align="stretch">
      <FirstRun name={name} invitations={invitations} />
      {items.length > 0 ? list : null}
    </Stack>
  )
}

/** Rien de neuf : toujours le même objet, d'un rendu à l'autre. */
const NO_NEWS: News = { count: null, more: false, authors: [], kinds: [] }

/** « Mes ruches » relues chaque minute sous la pastille d'une ruche, comme la tête de « Tout ». */
const HIVE_NEWS_INTERVAL_MS = 60_000

/**
 * R10 (relecture, scénario « le bouton des nouveautés vaut pour la pastille choisie ») : les
 * nouveautés de la ruche choisie, lues dans « mes ruches » (`news`, compté depuis sa dernière
 * visite). Relire la tête du Fil de la ruche, comme « Tout » le fait, avancerait la date de visite
 * (la première page la pose, voir hives/api.ts) : la ruche se croirait vue sans l'être.
 *
 * Le compte n'est cru que si « mes ruches » ont été lues après la dernière page du Fil de la ruche
 * (`dataUpdatedAt`), et ne sont pas en train de l'être : avant, il compte encore les cartes qu'on a
 * sous les yeux (« 2 nouveautés » au-dessus des deux mêmes projets). Ni visages ni sortes : le
 * compte seul, « 2 nouveautés », comme la ligne de « Tes ruches ».
 */
const hiveNewsOf = (
  hive: HiveSummary,
  read: { at: number; fetching: boolean },
  feed: { data?: unknown; dataUpdatedAt: number } | undefined,
): News =>
  hive.news > 0 && feed?.data !== undefined && !read.fetching && read.at > feed.dataUpdatedAt
    ? { count: hive.news, more: false, authors: [], kinds: [] }
    : NO_NEWS

/**
 * Hook (R10) : la pastille du Fil. Elle vit dans l'adresse (`/feed?hive=<id>`), lue après l'hydratation
 * (la page pré-rendue ne connaît pas l'adresse) ; une ruche dont le membre ne fait pas partie (plus
 * membre, adresse recopiée) vaut « Tout ». Choisir une pastille change le seul paramètre, sans
 * nouvelle entrée d'historique (`setParams`).
 *
 * - `hives` : ses ruches, dans l'ordre de l'API (les pastilles, « Tes ruches ») ;
 * - `chosen` : la ruche choisie, ou `undefined` pour « Tout » ;
 * - `waiting` : ses ruches ne sont pas encore lues (le Fil attend, voir plus haut) ;
 * - `invitations` : ses invitations valables (le premier lancement les montre) ;
 * - `read` : quand ses ruches ont été lues, et si elles le sont en ce moment.
 */
const useHiveChoice = () => {
  const router = useRouter()
  const hydrated = useHydrated()
  const asked = useHiveParam()
  const wanted = hydrated ? asked : undefined
  // Sous la pastille d'une ruche, relues chaque minute : ses nouveautés (voir hiveNewsOf).
  const mine = useMyHives(wanted ? { refetchInterval: HIVE_NEWS_INTERVAL_MS } : {})
  const hives: HiveSummary[] = mine.data?.hives ?? []
  const chosen = wanted ? hives.find((hive) => hive.id === wanted) : undefined
  const choose = useCallback(
    (value: string) => {
      const hive = value === ALL_HIVES ? undefined : value
      if (router.setParams) router.setParams({ hive })
      else router.replace(hive ? `/feed?hive=${encodeURIComponent(hive)}` : '/feed')
    },
    [router],
  )
  return {
    hives,
    chosen,
    waiting: mine.isPending,
    invitations: mine.data?.invitations ?? [],
    choose,
    // Quand « mes ruches » ont été lues, et si elles le sont en ce moment (voir hiveNewsOf).
    read: { at: mine.dataUpdatedAt, fetching: mine.isFetching },
  }
}

/** Hook : le paramètre `hive` de l'adresse (même garde que `usePublishedParam`, plus bas). */
const useHiveParam = (): string | undefined => {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir usePublishedParam)
    return firstParam(useLocalSearchParams<{ hive?: string | string[] }>().hive)
  } catch {
    return undefined
  }
}

type HiveFeedProps = {
  hiveId: string
  /** R16 : son squelette prend la suite d'un autre encore à l'écran (voir `continued`). */
  skeletonShown: boolean
  /** Le haut du fil (la phrase de la ruche), sur téléphone ; null sur ordinateur. */
  news: ReactNode
  onExplore: () => void
  hideMascot: boolean
}

/**
 * R10 : le Fil d'une ruche (GET /v1/feed/following?hive=<id>), de même forme que « Tout ». « Tu es
 * à jour » se pose d'après sa dernière visite de la ruche (`lastReadAt` de la première page), figée
 * pour la visite comme celle de « Tout ». Un fil vide finit sur « Tu es à jour ».
 */
function HiveFeed({ hiveId, skeletonShown, news, onExplore, hideMascot }: HiveFeedProps) {
  const feed = useHiveFeed(hiveId)
  const firstPage = feed.data?.pages[0]
  const readBefore = useReadBefore(firstPage)
  // R16 : le même squelette que « Tout », qui fond vers le Fil de la ruche quand il arrive.
  return (
    <Reveal
      loading={!feed.data && !feed.isError}
      skeleton={<FeedSkeleton news={news} shown={skeletonShown} />}
    >
      {feed.data ? (
        <FeedList
          feed={feed}
          items={feed.data.pages.flatMap((page) => page.items)}
          news={news}
          upToDate={{ readBefore: readBefore ?? null, onExplore, hideMascot }}
        />
      ) : (
        <FeedError error={feed.error} onRetry={() => void feed.refetch()} />
      )}
    </Reveal>
  )
}

/**
 * R16 : le squelette de la colonne principale s'est montré. `Reveal` le sait déjà (pour son fondu,
 * par `LoadingShownContext`) ; MemberHome le note aussi, pour que le squelette suivant prenne sa
 * suite sans attendre (voir `continued`). Ce composant passe le signal aux deux.
 */
function NoteShown({ onShown, children }: { onShown: () => void; children: ReactNode }) {
  const toReveal = useContext(LoadingShownContext)
  const both = useCallback(() => {
    toReveal?.()
    onShown()
  }, [toReveal, onShown])
  return <LoadingShownContext.Provider value={both}>{children}</LoadingShownContext.Provider>
}

/** Les refus d'une invitation dont l'appli a le message propre ; les autres disent « Réessaie. ». */
const INVITATION_ERRORS: ReadonlySet<ApiErrorKey> = new Set([
  'invitationExpired',
  'hivesJoinedLimit',
  'hiveFull',
  'alreadyHiveMember',
  'notFound',
])

/**
 * R10 (F-Fil9, planche R4-Fil-Premier) : ses invitations au premier lancement, sous le salut et
 * au-dessus des proches à suivre. « Rejoindre la ruche » ouvre la page de la ruche (comme l'onglet
 * Ruches) ; « Refuser » laisse la carte à sa place, « Invitation refusée. », jusqu'à la prochaine
 * visite. Les invitations vues pendant la visite sont gardées dans l'ordre où elles sont arrivées :
 * la liste relue après un refus ne l'a plus, la carte reste. Un échec se dit sous la carte.
 */
function FeedInvitations({ invitations }: { invitations: readonly Invitation[] }) {
  const { t } = useTranslation()
  const router = useRouter()
  const accept = useAcceptInvitation()
  const refuse = useRefuseInvitation()
  const [kept, setKept] = useState<readonly Invitation[]>([])
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set())
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  // Les invitations arrivées depuis le dernier rendu rejoignent la liste gardée (pendant le rendu,
  // comme useReadBefore : aucun rendu sans elles).
  const added = invitations.filter((one) => !kept.some((known) => known.id === one.id))
  const all = added.length > 0 ? [...kept, ...added] : kept
  if (added.length > 0) setKept(all)
  // Une invitation partie de la liste (acceptée, expirée) part de l'écran ; une refusée reste.
  const shown = all.filter(
    (one) => refused.has(one.id) || invitations.some((current) => current.id === one.id),
  )
  if (shown.length === 0) return null

  const messageOf = (error: unknown, fallback: string) => {
    const key = errorKey(error)
    return INVITATION_ERRORS.has(key) ? t(($) => $.errors[key]) : fallback
  }
  // Une seule action miel par écran (R10) : « Rejoindre » en miel sur la première carte qui a encore
  // ses boutons, en blanc sur les autres.
  const firstOpen = shown.findIndex((one) => !refused.has(one.id))
  return (
    <Stack gap="md" align="stretch">
      {shown.map((invitation, index) => (
        <Stack key={invitation.id} gap="sm" align="stretch">
          <HiveInvitation
            invitation={invitation}
            refused={refused.has(invitation.id)}
            primary={index === firstOpen}
            // Relecture de l'interface de R10 (point 1) : signaler la ruche depuis le Fil aussi,
            // comme depuis l'onglet Ruches (la carte refusée n'a plus de « … »).
            onReport={() =>
              router.push({ pathname: '/report', params: { kind: 'hive', id: invitation.hive.id } })
            }
            onAccept={async () => {
              setFailure(null)
              try {
                const hive = await accept.mutateAsync(invitation.id)
                router.push({ pathname: '/hives/[id]', params: { id: hive.id } })
              } catch (error) {
                setFailure({
                  id: invitation.id,
                  message: messageOf(
                    error,
                    t(($) => $.hives.invitations.acceptError),
                  ),
                })
              }
            }}
            onRefuse={async () => {
              setFailure(null)
              try {
                await refuse.mutateAsync(invitation.id)
                setRefused((current) => new Set(current).add(invitation.id))
              } catch (error) {
                setFailure({
                  id: invitation.id,
                  message: messageOf(
                    error,
                    t(($) => $.hives.invitations.refuseError),
                  ),
                })
              }
            }}
          />
          {failure?.id === invitation.id ? <Notice message={failure.message} /> : null}
        </Stack>
      ))}
    </Stack>
  )
}
