// Les états communs à tous les écrans qui chargent quelque chose : le chargement, la page réservée
// aux membres, l'erreur et la page introuvable. Chaque écran les assemble de la même façon, avec
// toujours une issue (réessayer, revenir, se connecter), au lieu d'un titre seul sur une page vide.
//
// Tous ont la même barre en haut et la même largeur que la page qu'ils remplacent (`width`) : la
// mise en page ne saute pas quand le chargement devient le contenu, ou une erreur.
//
// Ces pages n'ont pas d'autre titre que celui de leur état : il est donc de niveau 1 (`level`),
// comme le titre de la page qu'elles remplacent.
import { type Href, usePathname, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { nextAfterSignIn } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { Screen } from '../ui/Screen'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'

/** form : un écran étroit (profil, formulaire) ; page : une page large (projet, membre). */
type Width = 'form' | 'page'

/**
 * Pendant le chargement : le squelette de la page (Miel 2), des formes pleines à la place du
 * contenu qui arrive, plutôt que le mot « Chargement… » seul. Pour un lecteur d'écran, le squelette
 * s'appelle « Chargement… » et se dit occupé (ui/Skeleton.tsx). Une page large (projet, membre) a
 * trois cartes, un formulaire deux.
 * Pas de titre d'onglet propre : la page web pré-rendue (celle que montrent les aperçus d'un lien
 * partagé) en reste à ce stade, et y lirait « Chargement… ».
 */
export function LoadingScreen({ width = 'form' }: { width?: Width }) {
  const { t } = useTranslation()
  const back = useGoBack('/')
  // Un chargement qui dure (réseau lent, nouvelles tentatives) : au bout de quelques secondes,
  // « Revenir » apparaît sous le squelette (rien ne bouge au-dessus), pour ne jamais laisser le
  // membre sans issue.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <Screen header={<TopNav />} width={width}>
      <Stack gap="xl" align="stretch">
        <SkeletonList count={width === 'page' ? 3 : 2} />
        {slow ? (
          <Stack align="center">
            <Button label={t(($) => $.states.back)} onPress={back} variant="secondary" />
          </Stack>
        ) : null}
      </Stack>
    </Screen>
  )
}

/** Au-delà de ce délai, un chargement est jugé long. */
const SLOW_LOADING_MS = 4000

/**
 * Une page réservée aux membres, vue par un visiteur. « Se connecter » revient ensuite sur cette
 * même page (paramètre `next`, vérifié par la page de connexion : voir navigation/next.ts).
 */
export function SignedOutScreen({
  width = 'form',
  expired = false,
}: {
  width?: Width
  /** La session a expiré pendant la visite : on le dit, plutôt que « réservé aux membres ». */
  expired?: boolean
}) {
  const { t } = useTranslation()
  const router = useRouter()
  // usePathname : le chemin de la page affichée (« /members/abc »).
  const pathname = usePathname()
  return (
    <Screen header={<TopNav />} width={width} pageTitle={t(($) => $.states.signedOutTitle)}>
      <StateMessage
        kind="signedOut"
        level={1}
        title={t(($) => $.states.signedOutTitle)}
        message={expired ? t(($) => $.states.expired) : t(($) => $.home.membersOnly)}
        actions={[
          {
            label: t(($) => $.home.signIn),
            // push (et non replace) : le retour depuis la connexion ramène sur cette page, avec
            // les paramètres de son adresse quand la connexion les accepte (?announce=…).
            onPress: () =>
              router.push({ pathname: '/sign-in', params: { next: nextAfterSignIn(pathname) } }),
          },
          { label: t(($) => $.home.signUp), onPress: () => router.push('/sign-up') },
        ]}
      />
    </Screen>
  )
}

/**
 * Le chargement a échoué. « Réessayer » relance la demande (`onRetry`, par exemple le `refetch` de
 * React Query) : la page repasse alors par l'état de chargement, signe que la demande est partie.
 * « Revenir » ramène à la page précédente, ou à `fallback`.
 * Une session expirée en cours de route (refus « unauthorized ») n'est pas une erreur à réessayer :
 * on propose de se reconnecter, comme à un visiteur.
 */
export function LoadErrorScreen({
  error,
  onRetry,
  fallback = '/',
  width = 'form',
}: {
  error: unknown
  onRetry: () => void
  fallback?: Href
  width?: Width
}) {
  const { t } = useTranslation()
  const back = useGoBack(fallback)
  const key = errorKey(error)
  if (key === 'unauthorized') return <SignedOutScreen width={width} expired />
  return (
    <Screen header={<TopNav />} width={width} pageTitle={t(($) => $.states.errorTitle)}>
      <StateMessage
        kind="error"
        level={1}
        title={t(($) => $.states.errorTitle)}
        message={t(($) => $.errors[key])}
        actions={[
          { label: t(($) => $.common.retry), onPress: onRetry },
          { label: t(($) => $.states.back), onPress: back },
        ]}
      />
    </Screen>
  )
}

/**
 * La session ne se lit pas (le serveur répond 500, le réseau coupe) : on ne sait pas si quelqu'un
 * est connecté. Ce n'est pas un visiteur, on ne lui dit donc pas « Réservé aux membres » : la page
 * dit que le compte ne se charge pas et propose de réessayer (`onRetry`, le `refetch` de
 * `useSession`). Une seule demande par toucher : rien ne relit la session tout seul en boucle.
 * `withBack={false}` sur l'accueil : « Retour » y ramènerait à la même page.
 */
export function SessionErrorScreen({
  onRetry,
  width = 'form',
  withBack = true,
}: {
  onRetry: () => void
  width?: Width
  withBack?: boolean
}) {
  const { t } = useTranslation()
  const back = useGoBack('/')
  return (
    // Les textes de la page en panne (« Cette page n'a pas pu se charger ») et du message de
    // « Mon compte » (« Impossible de charger ton compte… ») : deux clés de plus faisaient dépasser
    // à TypeScript sa profondeur de calcul des clés de t() (TS2589).
    <Screen header={<TopNav />} width={width} pageTitle={t(($) => $.states.errorTitle)}>
      <StateMessage
        kind="error"
        level={1}
        title={t(($) => $.states.errorTitle)}
        message={t(($) => $.account.loadError)}
        actions={[
          { label: t(($) => $.common.retry), onPress: onRetry },
          ...(withBack ? [{ label: t(($) => $.states.back), onPress: back }] : []),
        ]}
      />
    </Screen>
  )
}

/**
 * Ce qu'on cherchait n'existe pas (ou n'est pas visible) : retour à l'accueil.
 *
 * `ambiance` : « light » (par défaut) pour un contenu introuvable à l'intérieur de l'appli (un
 * projet, un membre) ; « brand » pour une adresse qui ne mène nulle part (NotFoundScreen), un moment
 * de marque sur le miel vif (R1). Dans les deux cas, la barre de navigation reste (« Mon compte »
 * partout, décision de Louis du 29/10/2026) : sur le miel, elle se pose au-dessus de la feuille.
 */
export function NotFoundState({
  title,
  message,
  width = 'form',
  ambiance = 'light',
}: {
  title: string
  message?: string
  width?: Width
  ambiance?: 'brand' | 'light'
}) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen header={<TopNav />} width={width} pageTitle={title} ambiance={ambiance}>
      <StateMessage
        kind="notFound"
        level={1}
        title={title}
        {...(message ? { message } : null)}
        actions={[{ label: t(($) => $.states.home), onPress: () => router.replace('/') }]}
      />
    </Screen>
  )
}

/**
 * Un compte suspendu ouvre le formulaire d'un projet (tranche 7c), par l'adresse ou un ancien
 * lien : il ne peut ni publier ni modifier. La page le dit et mène au projet (en modification), ou
 * ramène d'où il vient. Le bandeau de la barre du haut dit jusqu'à quand.
 */
export function SuspendedState({
  projectId,
  width = 'form',
}: {
  projectId?: string | undefined
  width?: Width
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/')
  return (
    <Screen header={<TopNav />} width={width} pageTitle={t(($) => $.suspension.formTitle)}>
      <StateMessage
        kind="signedOut"
        level={1}
        title={t(($) => $.suspension.formTitle)}
        message={t(($) => $.suspension.formBody)}
        actions={
          projectId
            ? [
                {
                  label: t(($) => $.states.seeProject),
                  onPress: () =>
                    router.replace({ pathname: '/projects/[id]', params: { id: projectId } }),
                },
              ]
            : [{ label: t(($) => $.states.back), onPress: back }]
        }
      />
    </Screen>
  )
}

/** Un membre ouvre la modification d'un projet qui n'est pas le sien : il peut le voir, pas le changer. */
export function NotMineState({ projectId, width = 'form' }: { projectId: string; width?: Width }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen header={<TopNav />} width={width} pageTitle={t(($) => $.states.notMineTitle)}>
      <StateMessage
        kind="signedOut"
        level={1}
        title={t(($) => $.states.notMineTitle)}
        message={t(($) => $.project.page.notMine)}
        actions={[
          {
            label: t(($) => $.states.seeProject),
            onPress: () =>
              router.replace({ pathname: '/projects/[id]', params: { id: projectId } }),
          },
          { label: t(($) => $.states.home), onPress: () => router.replace('/') },
        ]}
      />
    </Screen>
  )
}
