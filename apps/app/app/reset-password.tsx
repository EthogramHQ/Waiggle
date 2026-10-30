// Page : « Choisis un nouveau mot de passe » (« /reset-password?token=… »), ouverte par le lien de
// l'e-mail. L'écran lui-même est dans src/screens.
//
// Le jeton du lien est dans l'adresse de la page : la balise `referrer` demande au navigateur de ne
// jamais envoyer cette adresse à un autre site (l'en-tête Referer d'une image, d'une police, d'un
// lien suivi). Head (d'expo-router) l'écrit dans l'en-tête du document web, y compris dans la page
// pré-rendue : elle est là avant que quoi que ce soit ne se charge. L'écran retire ensuite le jeton
// de l'adresse (relecture de sécurité du plan, A1).
import Head from 'expo-router/head'
import { Platform } from 'react-native'
import { ResetPasswordScreen } from '../src/screens/ResetPasswordScreen'

export default function ResetPassword() {
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <meta name="referrer" content="no-referrer" />
        </Head>
      ) : null}
      <ResetPasswordScreen />
    </>
  )
}
