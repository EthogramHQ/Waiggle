// La barre d'onglets du téléphone, branchée sur l'appli (refonte, tranche R3). ui/TabBar.tsx dessine
// la barre et ne décide de rien ; ce fichier lui donne ses données :
// - où l'on est (`usePathname`) : quel onglet est actif, et si la barre se montre (la table des
//   chemins, plus bas) ;
// - qui est là : la session (jamais de barre pour un visiteur), le profil (la photo de « Moi ») et
//   la suspension (un compte suspendu ne publie plus : le « + » disparaît) ;
// - la largeur : la barre est celle du téléphone ; à partir de la tablette, la barre du haut
//   (navigation/TopNav.tsx) prend le relais ;
// - l'hydratation : sur le web, la page est pré-rendue sans connaître le visiteur, donc sans barre.
//
// Elle est posée une seule fois pour toute l'appli, dans app/_layout.tsx, dans le cadre `TabBarHost`
// (`<TabBarHost bar={<AppTabBar />}>`) : la même barre reste à l'écran d'une page à l'autre, et sa
// goutte peut glisser d'un onglet au suivant. Aucun style ici (règle Biome de src/navigation) : la
// mise en forme vit dans src/ui.

import { usePathname, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Platform } from 'react-native'
import { useMemberSession } from '../accounts/session'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { useMe } from '../profile/hooks'
import { TabBar, type TabBarTab, type TabKey } from '../ui/TabBar'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'

/** La première page de chaque onglet : celle qu'ouvre l'onglet, et où il ramène quand on le retouche. */
const firstPages: Record<TabKey, string> = {
  feed: '/',
  explore: '/explore',
  hives: '/hives',
  me: '/me',
}

/** La page de publication, qu'ouvre le rond miel « + ». */
const PUBLISH_HREF = '/projects/new'

/**
 * Deux demandes d'aller à la même page à moins de ce délai n'en font qu'une. La barre (ui/TabBar)
 * garde déjà la double tape sur un onglet inactif ; restent le « + » et l'onglet actif retouché
 * hors de sa première page, qui, sans cette garde, ouvriraient la page deux fois (la seconde tape
 * arrive avant que l'adresse ait changé). Même délai que la barre et que `Dialog`.
 */
const SAME_PAGE_MS = 600

/** Ce que la barre doit montrer à une adresse. */
type Place =
  /** Une page de premier niveau : la barre, et cet onglet actif. */
  | { kind: 'tab'; tab: TabKey; firstPage: boolean }
  /** La page d'un autre membre : la barre, et l'onglet d'où l'on vient reste actif. */
  | { kind: 'member' }
  /** Une page poussée par-dessus les onglets (un projet, les réglages…) : pas de barre. */
  | { kind: 'hidden' }

/**
 * La table des chemins (plan de R3) : Fil `/` ; Explorer `/explore`, `/search`, `/tools`,
 * `/tags/<outil>` ; Ruches `/hives` ; Moi `/me` et sa propre page `/members/<soi>`. La page d'un
 * autre membre garde la barre ; toute autre adresse la cache. `selfId` : l'identifiant du membre
 * connecté. Exportée pour être lue d'un coup d'œil et essayée sans écran.
 */
export const placeOf = (pathname: string, selfId: string): Place => {
  // usePathname rend l'adresse sans ses paramètres ; on les retire quand même (une adresse écrite à
  // la main, un test), ainsi qu'une barre oblique finale (« /explore/ » vaut « /explore »).
  const path = pathname.split('?')[0]?.replace(/(.)\/+$/, '$1') ?? '/'
  if (path === '/') return { kind: 'tab', tab: 'feed', firstPage: true }
  if (path === '/explore') return { kind: 'tab', tab: 'explore', firstPage: true }
  if (path === '/search' || path === '/tools' || /^\/tags\/[^/]+$/.test(path))
    return { kind: 'tab', tab: 'explore', firstPage: false }
  if (path === '/hives') return { kind: 'tab', tab: 'hives', firstPage: true }
  if (path === '/me') return { kind: 'tab', tab: 'me', firstPage: true }
  const member = /^\/members\/([^/]+)$/.exec(path)
  if (member) {
    return member[1] === selfId ? { kind: 'tab', tab: 'me', firstPage: false } : { kind: 'member' }
  }
  return { kind: 'hidden' }
}

/**
 * Hook : le clavier du téléphone est-il ouvert ? Seulement sur Android, où l'écran rétrécit au-dessus
 * du clavier : la barre, posée en bas, remonterait avec lui et cacherait les résultats de la
 * recherche qu'on est en train de taper (relecture de l'interface du plan). Sur iOS, le clavier
 * passe par-dessus la barre ; sur le web, aucun événement de clavier.
 */
const useAndroidKeyboardOpen = (): boolean => {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [])
  return open
}

export function AppTabBar() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const hydrated = useHydrated()
  const { sizeClass } = useLayout()
  const member = useMemberSession()
  const signedIn = member.state === 'signedIn'
  const phone = sizeClass === 'compact'
  const keyboardOpen = useAndroidKeyboardOpen()
  // Le profil partagé (une seule copie en cache pour toute l'appli), pour la photo de « Moi ». Sans
  // relecture à l'apparition d'une lecture qui vient d'échouer (`retryOnMount: false`, comme la
  // barre du haut) : sinon un profil en panne ferait boucler les requêtes. Rien pour un visiteur.
  const me = useMe(signedIn, { retryOnMount: false })
  const { suspended } = useSuspension()
  // Les photos passent par l'API avec la session (src/api/media.ts) ; lues seulement si la barre
  // peut se montrer.
  const toSource = useMediaSources(signedIn && phone)
  const space = useTabBarSpace()

  const place = placeOf(pathname, member.session?.user.id ?? '')

  // L'onglet d'où l'on vient, gardé pour la page d'un autre membre (scénario : « l'onglet d'où l'on
  // vient reste actif »). Une « ref » : une valeur qui survit d'un rendu à l'autre sans redessiner.
  // Elle vit avec la barre, posée une fois pour toute l'appli : elle suit donc tout le parcours,
  // pages sans barre comprises (le Fil, puis un projet, puis la page de son auteur : le Fil reste
  // actif). Une page de membre ouverte directement (lien, rechargement) n'a pas d'onglet d'origine :
  // aucun n'est actif. Pourquoi pas une variable du module : elle survivrait au démontage de la
  // barre (un test, une déconnexion), et la page suivante hériterait d'un onglet d'un autre parcours.
  const lastTab = useRef<TabKey | null>(null)
  if (place.kind === 'tab') lastTab.current = place.tab
  const active: TabKey | null = place.kind === 'tab' ? place.tab : lastTab.current

  // La dernière page demandée, et quand : la garde contre l'ouverture en double (SAME_PAGE_MS).
  const lastRequest = useRef<{ href: string; at: number } | null>(null)
  const open = (href: string, how: 'push' | 'back') => {
    const now = Date.now()
    const previous = lastRequest.current
    if (previous && previous.href === href && now - previous.at < SAME_PAGE_MS) return
    lastRequest.current = { href, at: now }
    // `push` empile la page de l'onglet ; `dismissTo` revient à la première page de l'onglet si elle
    // est déjà dans l'historique (sinon Expo Router l'ouvre), au lieu d'en empiler une copie.
    if (how === 'push') router.push(href)
    else router.dismissTo(href)
  }

  const tabs = useMemo<TabBarTab[]>(
    () => [
      { key: 'feed', label: t(($) => $.nav.feed), href: firstPages.feed },
      { key: 'explore', label: t(($) => $.nav.explore), href: firstPages.explore },
      { key: 'hives', label: t(($) => $.nav.hives), href: firstPages.hives },
      { key: 'me', label: t(($) => $.nav.me), href: firstPages.me },
    ],
    [t],
  )

  // Pas de barre : au pré-rendu du web, pour un visiteur (ou tant que la session n'est pas lue, ou si
  // sa lecture a échoué : l'écran dit alors quoi faire), sur ordinateur et tablette, sur une page
  // poussée par-dessus les onglets, et sur Android pendant la frappe.
  if (!hydrated || !signedIn || !phone || place.kind === 'hidden' || keyboardOpen) return null

  const session = member.session
  const name = me.data?.name ?? session.user.name

  return (
    <TabBar
      tabs={tabs}
      active={active}
      avatar={{ name, source: toSource(me.data?.avatarUrl) }}
      publish={suspended ? null : { href: PUBLISH_HREF, label: t(($) => $.nav.publish) }}
      onPress={(target) => open(target === 'publish' ? PUBLISH_HREF : firstPages[target], 'push')}
      onReselect={(tab) => {
        // C'est ici que se décide l'onglet retouché (la barre ne fait qu'appeler ce rappel) : sur
        // sa première page, la page remonte en haut (le signal du contexte, tabBarSpace.ts) ;
        // ailleurs (une page d'outil, sa propre page de membre, la page d'un autre membre), il
        // ramène à cette première page, et la page qu'on quitte n'a pas à remonter.
        if (place.kind === 'tab' && place.firstPage) space.scrollToTop()
        else open(firstPages[tab], 'back')
      }}
    />
  )
}
