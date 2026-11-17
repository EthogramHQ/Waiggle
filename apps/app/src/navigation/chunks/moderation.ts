// Les écrans de la modération, réunis en un seul morceau chargé à la demande (R13,
// navigation/lazyScreen.tsx). Pourquoi les réunir : quand deux morceaux partagent un module (les
// requêtes de la modération, ici), la construction du site le range dans un morceau commun que
// chaque page charge d'emblée, accueil compris. Un module qui les exporte tous, seul demandé par
// les routes de la famille, donne un morceau à part entière, et rien de la modération au départ.
export { SuspendSheet } from '../../moderation/SuspendSheet'
export { ModerationCategoriesScreen } from '../../screens/ModerationCategoriesScreen'
export { ModerationScreen } from '../../screens/ModerationScreen'
export { ModerationToolsScreen } from '../../screens/ModerationToolsScreen'
