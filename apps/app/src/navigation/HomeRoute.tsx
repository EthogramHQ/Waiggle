// La page de l'adresse `/` (app/index.tsx), tranche R12 : l'accueil et sa vitrine, pour tout le
// monde. Une exception, sur téléphone seulement : l'appli qui s'ouvre avec une session va
// directement au Fil (`/feed`), comme le scénario le demande (« Qui arrive où » : « sur téléphone,
// l'appli s'ouvre sur l'onglet Fil » ; plan R12, choix 8).
//
// Sur le web, rien de tel ici : c'est le serveur qui envoie au Fil le membre qui arrive, avant même
// d'envoyer la page (il lit le marqueur `waiggle_member`, accounts/memberMarker.ts). Une fois dans
// l'appli, le logo et les liens vers l'accueil montrent la vitrine, partout.
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useMemberSession } from '../accounts/session'
import { ShowcaseScreen } from '../screens/ShowcaseScreen'
import { LaunchScreen } from '../ui/LoadingLogo'

/**
 * L'ouverture de l'appli, décidée une seule fois par lancement. Un objet du module, à dessein : la
 * page `/` est démontée quand on la quitte (le Fil la remplace), et un membre qui y revient plus
 * tard (un lien vers l'accueil) doit voir la vitrine, pas repartir au Fil. Exporté pour que les
 * tests repartent d'un lancement neuf.
 */
export const launch = { decided: false }

export function HomeRoute() {
  const { state } = useMemberSession()
  // La page est-elle celle du lancement ? Lu une fois, au premier affichage de cette page.
  const [atLaunch] = useState(() => Platform.OS !== 'web' && !launch.decided)
  const decided = atLaunch && state !== 'pending'
  // Dès que la session est lue (ou que sa lecture a échoué : on ne sait pas, la vitrine), le
  // lancement est décidé pour de bon.
  useEffect(() => {
    if (decided) launch.decided = true
  }, [decided])

  if (!atLaunch) return <ShowcaseScreen />
  // Pendant la lecture de la session, au lancement : l'écran du lancement continue, plutôt que de
  // montrer la vitrine un instant à un membre qui s'en va aussitôt au Fil.
  if (state === 'pending') return <LaunchScreen />
  // `Redirect` remplace la page (pas de retour vers elle) une fois la navigation prête.
  if (state === 'signedIn') return <Redirect href="/feed" />
  return <ShowcaseScreen />
}
