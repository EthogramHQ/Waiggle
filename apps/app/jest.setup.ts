// Préparation commune à tous les tests de l'appli, exécutée avant chaque fichier de test.

// Le stockage local de l'appareil n'existe pas dans les tests : on le remplace par une version en
// mémoire, fournie par la bibliothèque elle-même.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// Les animations (Reanimated) tournent normalement sur un fil séparé de l'appareil, piloté par le
// module natif « worklets ». En test, il n'y a pas d'appareil : on utilise les versions simulées
// fournies par ces bibliothèques, où une animation arrive tout de suite à sa valeur finale.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
require('react-native-reanimated').setUpTests()

// Aucun test ne parle au vrai réseau, ni à la vraie session. Le client Better Auth (une bibliothèque
// en modules ESM, que Jest ne charge pas) est remplacé par un client inerte, et fetch échoue : un
// écran qui demande quelque chose que son test n'a pas prévu (la cloche de la barre du haut, sur
// ordinateur) reçoit une erreur réseau, comme hors ligne, au lieu d'appeler un serveur. Les tests
// qui en ont besoin posent leurs propres faux (api/client.test.ts, accounts/api.test.ts).
jest.mock('./src/accounts/auth-client', () => ({ authClient: { getCookie: () => null } }))
globalThis.fetch = jest.fn(() => Promise.reject(new Error('No network in tests')))

// Un test n'a pas de navigateur de pages : le vrai `useNavigation()` d'Expo Router y échoue
// (« Couldn't find a navigation object »). Par défaut, il rend donc une navigation inerte, qui
// n'écoute rien (la garde de sortie `useLeaveGuard` des feuilles s'y pose sans rien arrêter). Un
// test qui rejoue `beforeRemove` pose son propre `jest.mock('expo-router', …)`, qui l'emporte.
// La fabrique ne s'exécute que si un fichier charge `expo-router`.
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useNavigation: () => ({
    addListener: () => () => {},
    dispatch: () => {},
  }),
}))

// La fenêtre des tests est celle d'un téléphone (390 × 844 points), comme les captures « téléphone ».
// Par défaut, React Native prend 750 points de large, ce qui est déjà une tablette pour l'appli
// (barre de navigation, colonnes) : les tests d'écran décrivent le téléphone, sauf mention contraire.
const { Dimensions } = require('react-native')
const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
Dimensions.set({ window: phone, screen: phone })

// React Query prévient React d'un changement (une page de plus arrivée) au tour suivant de la boucle
// d'événements (setTimeout). Dans un test, ce tour vient après act() : le hook lu juste après
// montrerait encore l'état d'avant. On prévient React dès la fin de la tâche en cours (une
// « microtâche »), ce que act() attend.
require('@tanstack/react-query').notifyManager.setScheduler(queueMicrotask)

// La place de la barre du haut est retenue d'un écran à l'autre (ui/ScreenTopBar.tsx) : chaque test
// part sans place mesurée, sinon un test hériterait de la mesure du précédent.
afterEach(() => require('./src/ui/ScreenTopBar').forgetTopBarSpace())
