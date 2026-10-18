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

// La fenêtre des tests est celle d'un téléphone (390 × 844 points), comme les captures « téléphone ».
// Par défaut, React Native prend 750 points de large, ce qui est déjà une tablette pour l'appli
// (barre de navigation, colonnes) : les tests d'écran décrivent le téléphone, sauf mention contraire.
const { Dimensions } = require('react-native')
const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
Dimensions.set({ window: phone, screen: phone })
