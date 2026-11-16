// Page d'accueil (« / »). Expo Router exige un export par défaut : on y place l'écran, rangé dans
// src/screens pour pouvoir le tester indépendamment de la navigation. Depuis R12, l'accueil est la
// vitrine, pour tout le monde (un membre connecté y garde sa barre) ; le Fil a sa propre adresse,
// `/feed` (app/feed.tsx). Sur le web, un membre qui arrive sur `/` est envoyé au Fil par le serveur,
// qui lit le marqueur `waiggle_member` (src/accounts/memberMarker.ts) ; un visiteur, vers `/fr/` ou
// `/en/`. Sur téléphone, l'appli s'ouvre sur le Fil (src/navigation/HomeRoute.tsx).
import { HomeRoute } from '../src/navigation/HomeRoute'

export default HomeRoute

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
