// Point d'entrée de l'appli (le champ « main » de package.json). Expo Router prend ensuite la main
// et affiche la page qui correspond à l'adresse (dossier app/).
// On passe par ce fichier pour charger quelques réglages AVANT tout le reste de l'appli : les
// imports s'exécutent dans l'ordre où ils sont écrits.
import './src/strict-browser'
// Le relais du Retour du navigateur doit être posé avant Expo Router : Chromium appelle les
// écouteurs de `popstate` dans l'ordre de pose (voir src/navigation/backRelay.ts).
import './src/navigation/backRelay'
import 'expo-router/entry'
