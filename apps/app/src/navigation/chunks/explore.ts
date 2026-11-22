// Explorer, la recherche, « Tous les outils » et les notifications, réunis en un seul morceau chargé
// à la demande (R18, choix 7 du plan ; navigation/lazyScreen.tsx ; pourquoi les réunir :
// chunks/moderation.ts). Quatre morceaux séparés partageraient chacun un cinquième, commun, que
// chaque page chargerait d'emblée : un seul fichier d'export évite d'en créer.
export { ExploreScreen } from '../../screens/ExploreScreen'
export { NotificationsScreen } from '../../screens/NotificationsScreen'
export { SearchScreen } from '../../screens/SearchScreen'
export { ToolsScreen } from '../../screens/ToolsScreen'
