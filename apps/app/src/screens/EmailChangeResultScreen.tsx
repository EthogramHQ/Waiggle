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
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { Button } from '../ui/Button'
import type { IconName } from '../ui/Icon'
import { Emblem } from '../ui/Illustrations'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'
import { LoadingScreen } from './states'

type Props = { step: 'confirmed' | 'done' | 'signInFirst' }

export function EmailChangeResultScreen({ step }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { data, isPending } = useSession()
  // `error` vient de l'adresse : le serveur qui pré-rend la page web ne la connaît pas. On ne la
  // lit qu'une fois dans le navigateur (voir ui/theme/hydration.ts) ; avant, la page attend sans
  // rien affirmer, ni réussite ni refus. Son contenu n'est jamais montré : n'importe quel code (ou
  // plusieurs) veut dire « lien refusé ».
  const hydrated = useHydrated()
  const { error } = useLocalSearchParams<{ error?: string | string[] }>()
  const refused = hydrated && error !== undefined && error.length > 0

  // Recommencer, ou aller voir son compte : « Mon compte » demande de se connecter à qui ne l'est pas.
  const toAccount = () => router.replace('/account')

  const page: { title: string; icon: IconName; body: ReactNode } = refused
    ? {
        title: t(($) => $.account.emailChange.errorTitle),
        icon: 'warning-circle',
        body: (
          <>
            <Text tone="secondary" align="center">
              {t(($) => $.account.emailChange.errorBody)}
            </Text>
            <Button label={t(($) => $.account.emailChange.restart)} onPress={toAccount} />
          </>
        ),
      }
    : step === 'signInFirst'
      ? {
          // Décision D1 : le second lien a été ouvert sans session. Rien n'a changé, et le lien
          // n'a pas servi : une fois connecté, le membre le rouvre depuis son e-mail.
          title: t(($) => $.account.emailChange.signInFirstTitle),
          icon: 'sign-in',
          body: (
            <>
              <Text tone="secondary" align="center">
                {t(($) => $.account.emailChange.signInFirstBody)}
              </Text>
              <Button
                label={t(($) => $.account.emailChange.signIn)}
                // push : le retour depuis la connexion ramène ici.
                onPress={() => router.push('/sign-in')}
              />
            </>
          ),
        }
      : step === 'confirmed'
        ? {
            title: t(($) => $.account.emailChange.confirmedTitle),
            icon: 'envelope-simple',
            body: (
              <>
                <Text tone="secondary" align="center">
                  {t(($) => $.account.emailChange.confirmedBody)}
                </Text>
                <Text variant="callout" tone="muted" align="center">
                  {t(($) => $.account.emailChange.confirmedNone)}
                </Text>
                {/* Toujours une issue : la suite se passe dans la boîte mail, mais la page ne reste pas
                  sans rien à toucher (la batterie y trouvait un focus du clavier perdu, faute du
                  moindre élément). En blanc : l'action attendue est d'ouvrir le second lien. */}
                <Button
                  label={t(($) => $.account.emailChange.toAccount)}
                  variant="secondary"
                  onPress={toAccount}
                />
              </>
            ),
          }
        : {
            title: t(($) => $.account.emailChange.doneTitle),
            icon: 'check',
            body: (
              <>
                {/* La session est lue (sinon, l'état de chargement plus bas) : on sait à qui l'on
                  parle. */}
                {data ? (
                  <Text tone="secondary" align="center">
                    {t(($) => $.account.emailChange.doneBody, { email: data.user.email })}
                  </Text>
                ) : (
                  <Text tone="secondary" align="center">
                    {t(($) => $.account.emailChange.doneSignedOut)}
                  </Text>
                )}
                <Text variant="callout" tone="muted" align="center">
                  {t(($) => $.account.emailChange.doneDevices)}
                </Text>
                {data ? (
                  <Button label={t(($) => $.account.emailChange.toAccount)} onPress={toAccount} />
                ) : (
                  <Button
                    label={t(($) => $.account.emailChange.signIn)}
                    // push : le retour depuis la connexion ramène ici.
                    onPress={() => router.push('/sign-in')}
                  />
                )}
              </>
            ),
          }

  // Avant l'hydratation, ni contenu ni titre d'onglet (`pageTitle={null}`) : la page ne sait pas
  // encore si le lien a été refusé. Le titre calculé ici serait celui de la réussite (« Adresse
  // changée »), que l'onglet afficherait un instant avant « Ce lien ne marche plus ».
  if (!hydrated) return <Screen pageTitle={null}>{null}</Screen>
  // « Adresse changée », membre connecté ou non : le temps de lire la session, l'état de
  // chargement plutôt qu'une page à moitié dessinée. L'adresse et le bouton arriveraient ensuite
  // au-dessus et au-dessous des autres textes, et tout bougerait sous le doigt (70 pt mesurés).
  if (step === 'done' && !refused && isPending) return <LoadingScreen />

  return (
    <Screen pageTitle={page.title}>
      <Stack align="center">
        <Emblem icon={page.icon} />
      </Stack>
      <Text variant="title2" align="center" heading={1}>
        {page.title}
      </Text>
      {page.body}
    </Screen>
  )
}
