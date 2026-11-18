// Le relais des passages de page (R17), sur le web : chaque navigation de l'appli passe par lui
// avant de partir, pour être jouée dans un passage (ui/pageTransition.web.ts).
//
// **L'entonnoir d'Expo Router.** `router.push`, `replace`, `navigate`, `back`, `dismissTo`, un
// `<Link>` ou un `<Redirect>` déposent tous leur action dans `routingQueue.add` (le fichier
// `expo-router/build/global-state/routingQueue.js`), qui la range dans une file que la navigation
// vide ensuite. Le relais remplace cette fonction : il devine la sorte du passage
// (`classifyPassage`), puis confie au moteur l'envoi de l'action à la vraie fonction (`runPassage`).
// C'est un import « profond », hors de l'API publique d'Expo Router : il vit dans ce seul fichier,
// et un test garde-fou (passageRelay.test.ts) casse si une montée de version déplace l'entonnoir.
// Sans relais, l'appli marche, sans passage.
//
// **Le Retour du navigateur.** `src/ui` n'importe pas `navigation/` : c'est donc ce relais qui écoute
// `popstate` (par backRelay.ts, avant Expo Router) et le dit au moteur (`notePopState`).
//
// Importé par `index.ts` après backRelay et avant `expo-router/entry`. Rien sur iOS et Android : la
// pile native anime elle-même ses pages.
import { routingQueue } from 'expo-router/build/global-state/routingQueue'
import { Platform } from 'react-native'
import {
  expectPopState,
  notePopState,
  passageBusy,
  runPassage,
  takeHint,
} from '../ui/pageTransition'
import { listenPopState, type RelayWindow } from './backRelay'
import { classifyPassage, type NavigationAction } from './classifyPassage'

/**
 * Les actions qui font reculer l'historique du navigateur (Expo Router appelle alors
 * `history.go(-n)`) : le `popstate` qui suit vient de nous, pas du bouton du navigateur.
 */
const goesBackInHistory = (action: NavigationAction): boolean =>
  action.type === 'GO_BACK' ||
  action.type === 'POP' ||
  action.type === 'POP_TO_TOP' ||
  (action.type === 'ROUTER_LINK' && action.payload?.options?.event === 'POP_TO')

let installed = false

/** Remplace `routingQueue.add` par le relais, une fois, et écoute le Retour du navigateur. */
const install = (page: RelayWindow & { location?: { pathname?: string } }) => {
  if (installed) return
  installed = true
  const send = routingQueue.add
  // L'adresse de la page du passage en cours : un second appui vers elle est ignoré.
  let passingTo: string | undefined

  routingQueue.add = (action: Parameters<typeof send>[0]) => {
    const link = action as NavigationAction
    const href = link.type === 'ROUTER_LINK' ? link.payload?.href : undefined
    const event = link.payload?.options?.event
    const busy = passageBusy()
    // Une double tape sur une carte : la page est déjà en route. Un `replace` (une garde, un
    // `Redirect`) n'est jamais ignoré : il attend la fin du passage.
    if (busy && event === 'PUSH' && href !== undefined && href === passingTo) return
    const kind = classifyPassage(link, page.location?.pathname ?? '/', takeHint())
    runPassage(kind, () => {
      if (goesBackInHistory(link)) expectPopState()
      send.call(routingQueue, action)
    })
    if (!busy && passageBusy()) passingTo = href
  }

  listenPopState(page, () => notePopState())
}

// Au chargement : sur le web seulement (ni téléphone, ni pré-rendu, où `window` n'existe pas).
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const page = window as unknown as Partial<RelayWindow>
  if (page.addEventListener && page.removeEventListener) install(page as RelayWindow)
}
