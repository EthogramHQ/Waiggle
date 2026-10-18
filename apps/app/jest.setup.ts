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
