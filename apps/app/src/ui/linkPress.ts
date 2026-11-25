// Le geste d'un lien interne de src/ui qui ne reçoit que son adresse (R19 : le titre « Ma récolte ›
// » du panneau du niveau, les lignes du classement). Le composant change lui-même de page par le
// routeur, comme `SettingsNav` et `LegalLinks`, au lieu de demander un rappel à chaque écran.
//
// Deux gardes :
// - sur le web, le lien est un vrai `<a href>` : on retient toujours le navigateur
//   (`preventDefault`), sinon il rechargerait toute l'appli en suivant l'adresse, même quand la
//   garde ci-dessous ignore la tape ;
// - une seule navigation pour deux tapes rapprochées (`useTapGuard`), partagée par tous les liens
//   du composant : la seconde tape d'une ligne ne pousse pas la page une deuxième fois, ni celle
//   de la voisine.
import { useRouter } from 'expo-router'
import { Platform } from 'react-native'
import type { PressEvent } from './ListGroup'
import { useTapGuard } from './tapGuard'

/** Rend une fonction qui, pour une adresse, donne le geste de son lien (toucher, clic, Entrée). */
export function useLinkPress() {
  const router = useRouter()
  const guard = useTapGuard()
  return (href: string) => {
    const go = guard(() => router.push(href as Parameters<typeof router.push>[0]))
    return (event?: PressEvent) => {
      if (Platform.OS === 'web') event?.preventDefault?.()
      go()
    }
  }
}
