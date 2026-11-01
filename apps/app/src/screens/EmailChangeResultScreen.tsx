// Les pages où mènent les deux liens d'un changement d'adresse (tranche « adresse ») :
// - `confirmed` (/email-change/confirmed) : l'ancienne adresse a donné son accord ; un second lien
//   part vers la nouvelle, si elle peut servir (la page dit la même chose dans tous les cas : on ne
//   révèle pas qu'une adresse est déjà celle d'un autre compte) ;
// - `done` (/email-change/done) : la nouvelle adresse est vérifiée, le changement est fait. Ce lien
//   ne connecte personne : la page parle à un membre connecté (son adresse, lue dans la session,
//   jamais dans l'URL) comme à un visiteur (« connecte-toi avec ta nouvelle adresse »).
// - `signInFirst` (/email-change/sign-in-first, tranche R2, décision D1) : le second lien ouvert
//   sans être connecté ; il n'aboutit que depuis le compte du membre, la page demande de se
//   connecter puis de rouvrir le lien.
// Un lien refusé (expiré, déjà servi, remplacé…) arrive sur l'une ou l'autre avec `?error=…`.
// Chaque page est un état commun (StateMessage, R4 ménage M7) : image, titre, texte et issues sont
// rangés à gauche, comme les autres états de l'appli.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import type { IconName } from '../ui/Icon'
import { Screen } from '../ui/Screen'
import { type StateKind, StateMessage } from '../ui/StateMessage'
import { useHydrated } from '../ui/theme/hydration'
import { LoadingScreen } from './states'

type Props = { step: 'confirmed' | 'done' | 'signInFirst' }

/** Ce que dit une page : l'état, son titre, ses paragraphes et ses issues (la première est la principale). */
type Page = {
  kind: StateKind
  icon?: IconName
  title: string
  message: string[]
  actions: { label: string; onPress: () => void; variant?: 'secondary' }[]
}

export function EmailChangeResultScreen({ step }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, session: data, retry } = useMemberSession()
  // `error` vient de l'adresse : le serveur qui pré-rend la page web ne la connaît pas. On ne la
  // lit qu'une fois dans le navigateur (voir ui/theme/hydration.ts) ; avant, la page attend sans
  // rien affirmer, ni réussite ni refus. Son contenu n'est jamais montré : n'importe quel code (ou
  // plusieurs) veut dire « lien refusé ».
  const hydrated = useHydrated()
  const { error } = useLocalSearchParams<{ error?: string | string[] }>()
  const refused = hydrated && error !== undefined && error.length > 0

  // Recommencer, ou aller voir son compte : « Mon compte » demande de se connecter à qui ne l'est pas.
  const toAccount = () => router.replace('/account')
  // push : le retour depuis la connexion ramène ici.
  const toSignIn = () => router.push('/sign-in')

  const page: Page = refused
    ? {
        kind: 'error',
        title: t(($) => $.account.emailChange.errorTitle),
        message: [t(($) => $.account.emailChange.errorBody)],
        actions: [{ label: t(($) => $.account.emailChange.restart), onPress: toAccount }],
      }
    : step === 'signInFirst'
      ? {
          // Décision D1 : le second lien a été ouvert sans session. Rien n'a changé, et le lien
          // n'a pas servi : une fois connecté, le membre le rouvre depuis son e-mail.
          kind: 'signedOut',
          title: t(($) => $.account.emailChange.signInFirstTitle),
          message: [t(($) => $.account.emailChange.signInFirstBody)],
          actions: [{ label: t(($) => $.account.emailChange.signIn), onPress: toSignIn }],
        }
      : step === 'confirmed'
        ? {
            kind: 'done',
            icon: 'envelope-simple',
            title: t(($) => $.account.emailChange.confirmedTitle),
            message: [
              t(($) => $.account.emailChange.confirmedBody),
              t(($) => $.account.emailChange.confirmedNone),
            ],
            // Toujours une issue : la suite se passe dans la boîte mail, mais la page ne reste pas
            // sans rien à toucher (la batterie y trouvait un focus du clavier perdu, faute du
            // moindre élément). En blanc : l'action attendue est d'ouvrir le second lien.
            actions: [
              {
                label: t(($) => $.account.emailChange.toAccount),
                variant: 'secondary',
                onPress: toAccount,
              },
            ],
          }
        : {
            kind: 'done',
            icon: 'check',
            title: t(($) => $.account.emailChange.doneTitle),
            message: [
              // La session est lue (sinon, l'état de chargement plus bas) : on sait à qui l'on
              // parle. Si sa lecture a échoué, on ne le sait pas : le changement reste annoncé,
              // mais on propose de réessayer plutôt que de se connecter (voir accounts/session.ts).
              data
                ? t(($) => $.account.emailChange.doneBody, { email: data.user.email })
                : state === 'error'
                  ? t(($) => $.account.loadError)
                  : t(($) => $.account.emailChange.doneSignedOut),
              t(($) => $.account.emailChange.doneDevices),
            ],
            actions: data
              ? [{ label: t(($) => $.account.emailChange.toAccount), onPress: toAccount }]
              : state === 'error'
                ? // Deux issues : relire la session, ou aller à « Mon compte », qui sait lui-même
                  // proposer de réessayer ou de revenir si la panne dure.
                  [
                    { label: t(($) => $.common.retry), onPress: retry },
                    {
                      label: t(($) => $.account.emailChange.toAccount),
                      variant: 'secondary',
                      onPress: toAccount,
                    },
                  ]
                : [{ label: t(($) => $.account.emailChange.signIn), onPress: toSignIn }],
          }

  // Avant l'hydratation, ni contenu ni titre d'onglet (`pageTitle={null}`) : la page ne sait pas
  // encore si le lien a été refusé. Le titre calculé ici serait celui de la réussite (« Adresse
  // changée »), que l'onglet afficherait un instant avant « Ce lien ne marche plus ».
  if (!hydrated) return <Screen pageTitle={null}>{null}</Screen>
  // « Adresse changée », membre connecté ou non : le temps de lire la session, l'état de
  // chargement plutôt qu'une page à moitié dessinée. L'adresse et le bouton arriveraient ensuite
  // au-dessus et au-dessous des autres textes, et tout bougerait sous le doigt (70 pt mesurés).
  if (step === 'done' && !refused && state === 'pending') return <LoadingScreen />

  return (
    <Screen pageTitle={page.title}>
      {/* level 1 : la page n'a pas d'autre titre (le cadre n'en reçoit que pour l'onglet). */}
      <StateMessage
        kind={page.kind}
        {...(page.icon ? { icon: page.icon } : null)}
        title={page.title}
        message={page.message}
        actions={page.actions}
        level={1}
      />
    </Screen>
  )
}
