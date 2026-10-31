// La barre du haut des tablettes et ordinateurs (refonte, tranche R3, « La barre du haut ») : une
// capsule de verre avec, de gauche à droite, le logo et le mot « waiggle » (retour au Fil), les
// liens Fil · Explorer · Ruches (le lien de la page ouverte dans sa goutte), le champ de recherche,
// la cloche des notifications, la photo « Moi » (sa propre page) et « Publier ». Un administrateur
// y trouve aussi « Modération ». Sur téléphone, elle n'apparaît pas : la barre d'onglets du bas
// (navigation/AppTabBar.tsx) prend le relais.
//
// Le champ de recherche (relecture de l'interface du plan, ui-5 et ui-6) :
// - hors de la page de recherche, c'est un lien vers elle, qui a l'air d'un champ vide : taper dans
//   un champ qui change de page en cours de frappe perdrait des lettres. La page ouverte, son champ
//   prend le focus ;
// - sur la page de recherche, c'est le vrai champ : ce qu'on tape s'écrit dans l'adresse (`?q=`),
//   que la page lit pour chercher ;
// - en largeur moyenne (700 à 1 100 points), la place manque : une loupe mène à la page, qui montre
//   alors son propre champ.
//
// « Publier » est un bouton de verre, pas de miel : l'action principale (en miel) reste celle de la
// page (« Tester la démo », « Publier un projet »), une seule par écran. Le formulaire de projet le
// masque (`hideNewProject`), et un compte suspendu ne le voit plus (l'API refuserait).
//
// Tranche 7c : la barre porte aussi le bandeau d'un compte suspendu (`SuspensionBanner`), sous la
// capsule. Toutes les pages la posent : le bandeau est ainsi monté une seule fois, jamais écran par
// écran. Sur téléphone, où la capsule n'apparaît pas, la barre ne montre que lui.
//
// Ce fichier n'écrit aucun style (règle de Biome sur src/navigation) : il assemble des composants
// de src/ui et les branche sur le routeur, la session et le profil.
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { useSuspension } from '../moderation/suspension'
import { NotificationBell } from '../notifications/NotificationBell'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { type NavLinkEntry, NavLinks, NavPhotoLink } from '../ui/NavLinks'
import { SearchButton, SearchField, SearchLink } from '../ui/SearchField'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { Wordmark } from '../ui/Wordmark'
import { firstParam } from './params'

type Props = {
  /** Masque « Publier » (sur le formulaire de projet, où il n'a pas de sens). */
  hideNewProject?: boolean
  /**
   * Le bandeau de suspension s'ouvre déplié, même déjà vu (l'accueil, décision de Louis du
   * 27/10/2026) ; ailleurs, il est replié dès la deuxième page (SuspensionBanner).
   */
  openSuspension?: boolean
  /**
   * La page des réglages est ouverte. Depuis R3, la photo y mène quand même à « Moi » (une autre
   * page que les réglages) : la propriété ne change plus rien à la barre. Gardée pour les écrans
   * des réglages qui la passent encore.
   */
  inSettings?: boolean
}

/** Les liens de la barre : les trois de la barre d'onglets, et la modération (administrateurs). */
type NavKey = 'feed' | 'explore' | 'hives' | 'moderation'

const SEARCH_PATH = '/search'

/**
 * Le lien de la page ouverte, d'après son adresse : la même table que la barre d'onglets du
 * téléphone (plan de R3, « La barre d'onglets »). Explorer reste actif sur ses pages filles : la
 * recherche, « Tous les outils » et la page d'un outil. Une page posée par-dessus (un projet, un
 * membre, une notification) n'est d'aucun lien.
 */
const activeFor = (pathname: string): NavKey | null => {
  if (pathname === '/') return 'feed'
  if (
    pathname === '/explore' ||
    pathname === SEARCH_PATH ||
    pathname === '/tools' ||
    pathname.startsWith('/tags/')
  )
    return 'explore'
  if (pathname === '/hives') return 'hives'
  if (pathname === '/moderation' || pathname.startsWith('/moderation/')) return 'moderation'
  return null
}

/**
 * Hook : le paramètre `q` de l'adresse (« /search?q=carnet »). Hors d'un navigateur (un test qui
 * remplace expo-router par un faux sans cette fonction, le catalogue), il n'y en a pas : la
 * fonction manque, l'appel lève une erreur, et l'aide répond « rien ». Même raisonnement que
 * ui/screenFocus.ts : l'issue du try est la même à chaque rendu, React compte donc toujours les
 * mêmes hooks.
 */
const useQueryParam = (): string | undefined => {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir ci-dessus)
    return firstParam(useLocalSearchParams<{ q?: string | string[] }>().q)
  } catch {
    return undefined
  }
}

/**
 * Le vrai champ de la barre, sur la page de recherche. Ce qu'on tape fait foi : il est gardé dans
 * l'état local, et écrit dans l'adresse à chaque frappe. L'adresse revient ensuite, un instant
 * plus tard (l'« écho ») : sans précaution, une lettre tapée entre-temps serait effacée par l'écho
 * de la frappe d'avant. Seule une adresse changée sans nous (le bouton « Précédent » du
 * navigateur, un lien vers une recherche) remplace ce qui est dans le champ.
 */
function BarSearchField() {
  const { t } = useTranslation()
  const router = useRouter()
  // Le paramètre n'est lu qu'une fois la page hydratée : le pré-rendu ne connaît pas l'adresse
  // complète (relecture de l'interface du plan, ui-5).
  const hydrated = useHydrated()
  const q = useQueryParam()
  const [value, setValue] = useState('')
  // Les valeurs écrites dans l'adresse dont l'écho n'est pas encore revenu, dans l'ordre.
  const pending = useRef<string[]>([])

  useEffect(() => {
    if (!hydrated) return
    const next = q ?? ''
    const echo = pending.current.indexOf(next)
    if (echo >= 0) {
      // L'écho d'une frappe : on oublie celle-ci et les précédentes, déjà dépassées.
      pending.current = pending.current.slice(echo + 1)
      return
    }
    pending.current = []
    setValue(next)
  }, [hydrated, q])

  const write = (text: string) => {
    pending.current.push(text)
    // Un champ vide retire le paramètre, plutôt que de laisser « ?q= » dans l'adresse.
    router.setParams({ q: text === '' ? undefined : text })
  }

  return (
    <SearchField
      label={t(($) => $.search.label)}
      placeholder={t(($) => $.search.placeholder)}
      value={value}
      onChangeText={(text) => {
        setValue(text)
        write(text)
      }}
      // Entrée ne fait rien de plus (la page cherche pendant qu'on tape) ; elle garde le focus
      // dans le champ, sur le web, au lieu de le rendre à la page.
      onSubmit={() => {}}
      // On vient ici pour chercher : le curseur est déjà dans le champ.
      autoFocus
      grow
    />
  )
}

export function TopNav({ hideNewProject = false, openSuspension = false }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { sizeClass } = useLayout()
  const { data: session } = useSession()
  const shown = sizeClass !== 'compact'
  // Le profil est lu sur toutes les largeurs : pour la photo de la capsule, et, sur téléphone aussi,
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
  const onSearchPage = pathname === SEARCH_PATH
  const onOwnPage = pathname === '/me' || pathname === `/members/${session.user.id}`
  const links: NavLinkEntry<NavKey>[] = [
    { key: 'feed', label: t(($) => $.nav.feed), href: '/' },
    { key: 'explore', label: t(($) => $.nav.explore), href: '/explore' },
    { key: 'hives', label: t(($) => $.nav.hives), href: '/hives' },
    // « Modération » pour un administrateur seulement (sur téléphone, la ligne reste dans les
    // réglages). Tant que le profil manque, on ne sait pas : le lien n'apparaît pas.
    ...(me.data?.isAdmin
      ? [{ key: 'moderation' as const, label: t(($) => $.nav.moderation), href: '/moderation' }]
      : []),
  ]
  const hrefOf = (key: NavKey) => links.find((link) => link.key === key)?.href ?? '/'

  // Le champ, au milieu : il prend la place qui reste. En largeur moyenne, une loupe (et rien sur
  // la page de recherche, qui montre alors son propre champ).
  const search =
    sizeClass === 'wide' ? (
      onSearchPage ? (
        <BarSearchField />
      ) : (
        <SearchLink
          label={t(($) => $.search.label)}
          placeholder={t(($) => $.search.placeholder)}
          href={SEARCH_PATH}
          onPress={() => router.push(SEARCH_PATH)}
          grow
        />
      )
    ) : onSearchPage ? null : (
      <SearchButton
        label={t(($) => $.nav.search)}
        href={SEARCH_PATH}
        onPress={() => router.push(SEARCH_PATH)}
      />
    )

  const capsule = (
    // Le rayon `sheet` (34) arrondit complètement une barre d'une ligne (62 points de haut), comme
    // une pilule ; à texte agrandi, quand la barre passe sur deux lignes, il ne rogne pas les coins
    // de ce qu'elle contient (un rayon de pilule le ferait).
    <Surface variant="glass" radius="sheet" padding="sm">
      {/* Les groupes passent à la ligne quand la place manque (texte agrandi, petite fenêtre),
          au lieu de se chevaucher. Le champ, entre les deux, prend la place qui reste. */}
      <Row gap="md" paddingX="sm" wrap>
        <Wordmark logo onPress={() => router.push('/')} />
        <NavLinks
          label={t(($) => $.nav.label)}
          links={links}
          active={activeFor(pathname)}
          onPress={(key) => router.push(hrefOf(key))}
        />
        {/* Sans champ (largeur moyenne), une place vide qui pousse le reste à droite. */}
        {sizeClass === 'wide' ? search : <Stack grow>{null}</Stack>}
        <Row gap="sm">
          {sizeClass === 'wide' ? null : search}
          {/* La cloche des notifications, avec le nombre de nouveautés (tranche 6b). */}
          <NotificationBell />
          {/* La photo mène à sa propre page, « Moi » (R3), d'où la roue ouvre les réglages. */}
          <NavPhotoLink
            label={t(($) => $.nav.me)}
            href="/me"
            current={onOwnPage}
            onPress={() => router.push('/me')}
            name={name}
            source={toSource(me.data?.avatarUrl)}
          />
          {/* Un compte suspendu ne publie plus : le bouton disparaît (l'API refuserait). Le texte
              est court (« Publier ») ; le nom lu reste complet (« Publier un projet »). */}
          {hideNewProject || suspension ? null : (
            <Button
              label={t(($) => $.nav.publish)}
              spokenLabel={t(($) => $.home.publish)}
              icon="plus"
              size="compact"
              variant="glass"
              onPress={() => router.push('/projects/new')}
            />
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
