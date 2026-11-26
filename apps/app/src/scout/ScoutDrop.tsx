// La Goutte posée sur l'appli (tranche R20, docs/scenarios/refonte.md, « La Goutte ») : le bouton
// des Éclaireuses (ui/HoneyDrop), monté une seule fois dans app/_layout.tsx, à côté de l'hôte du
// gain de pollen. Ce fichier décide seulement s'il se montre, ce qu'il dit et où il mène :
// - il se montre à une Éclaireuse active (le mois en cours, jamais retirée) qui a laissé « Afficher
//   la Goutte » coché, et à personne d'autre ;
// - jamais sur les pages de connexion, d'inscription, des règles et des autres pages sans compte,
//   ni pendant qu'une feuille est ouverte (elle se poserait sur ses boutons) ;
// - un appui ouvre la feuille « Ton retour » avec l'écran d'où l'on vient (`?from=`), sans ses
//   paramètres : ils peuvent désigner un commentaire, une recherche, qui ne regardent personne ;
// - un appui long la replie en languette, pour la session de l'appli (scout/dropFold.ts).
//
// Il part dans le premier paquet de l'appli (poids du premier chargement) : il n'importe que des
// modules déjà chargés (session, profil, navigation). Le bouton lui-même (ui/HoneyDrop) se charge à
// la demande, la première fois qu'il doit se montrer, avec le morceau des Éclaireuses
// (navigation/chunks/scout.ts) : seules une trentaine d'Éclaireuses le voient, les autres membres
// ne le téléchargent pas (1,7 Ko de moins au départ, CI de R20). Aucun style ici : HoneyDrop se
// place seul.
import { LEGAL_PAGES } from '@ruche/contracts'
import { supportedLanguages } from '@ruche/i18n'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { loadScoutChunk } from '../navigation/chunkLoaders'
import { lazyModule } from '../navigation/lazyModule'
import { isSheetPath } from '../navigation/sheetRoutes'
import { useMe } from '../profile/hooks'
import { useTapGuard } from '../ui/tapGuard'
import { useHydrated } from '../ui/theme/hydration'
import { foldDrop, unfoldDrop, useDropFolded } from './dropFold'

/**
 * Les pages sans Goutte, en plus des feuilles : celles d'avant le compte (connexion, inscription,
 * mot de passe oublié, adresse vérifiée…), les règles et leur acceptation, les pages légales (dans
 * chaque langue), la désinscription d'un e-mail et la page d'avertissement d'un lien externe.
 */
const NO_DROP_PATHS: ReadonlySet<string> = new Set([
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/check-email',
  '/verified',
  '/accept-rules',
  '/unsubscribe',
  '/out',
  ...LEGAL_PAGES.flatMap((page) => [
    `/${page}`,
    ...supportedLanguages.map((lang) => `/${lang}/${page}`),
  ]),
])

/** L'adresse sans ses paramètres ni son fragment, ni barre finale : ce que la feuille reçoit. */
export const screenPath = (pathname: string): string => {
  const path = pathname.split(/[?#]/)[0] ?? '/'
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** La Goutte a-t-elle sa place sur cette page ? */
const dropAllowedOn = (path: string): boolean =>
  !NO_DROP_PATHS.has(path) &&
  !path.startsWith('/email-change/') &&
  // La feuille « Ton retour » elle-même, au cas où sa route ne serait pas encore dans la liste des
  // feuilles : la Goutte ne se pose jamais sur elle.
  path !== '/scout-report' &&
  !isSheetPath(path)

// Le bouton, demandé seulement quand il doit se montrer (navigation/lazyModule.ts), dans le morceau
// des pages des Éclaireuses : la feuille « Ton retour » arrive avec lui, prête au premier toucher.
const useScoutParts = lazyModule(loadScoutChunk)

export function ScoutDrop() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  // Sur le web, la page est pré-rendue sans connaître le visiteur : rien avant l'hydratation.
  const hydrated = useHydrated()
  const member = useMemberSession()
  const signedIn = member.state === 'signedIn'
  // Le profil partagé (une copie en cache pour toute l'appli). Sans relecture à l'apparition d'une
  // lecture qui vient d'échouer (comme la barre d'onglets) : un profil en panne ne boucle pas.
  const { data: me } = useMe(signedIn, { retryOnMount: false })
  const folded = useDropFolded()
  // Deux tapes rapides n'ouvrent qu'une feuille : la seconde arrive avant que l'adresse change.
  const guard = useTapGuard()

  const scout = me?.scout
  const path = screenPath(pathname)
  const shown =
    hydrated &&
    signedIn &&
    scout?.active === true &&
    scout.showDrop &&
    // Les règles à accepter couvrent tout l'écran (rules/RulesGate) ; un compte suspendu ne peut
    // rien envoyer : pas de Goutte qui mènerait à un refus.
    me?.rulesAccepted !== false &&
    !me?.suspension &&
    dropAllowedOn(path)
  const HoneyDrop = useScoutParts(shown)?.HoneyDrop
  if (!shown || !HoneyDrop) return null

  const count = scout.missionsLeft
  const label =
    count > 0 ? t(($) => $.scout.drop.labelMissions, { count }) : t(($) => $.scout.drop.label)

  return (
    <HoneyDrop
      label={label}
      count={count}
      folded={folded}
      onPress={guard(() => router.push({ pathname: '/scout-report', params: { from: path } }))}
      onLongPress={foldDrop}
      onUnfold={unfoldDrop}
    />
  )
}
