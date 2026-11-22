// Point d'entrée de l'appli (le champ « main » de package.json). Expo Router prend ensuite la main
// et affiche la page qui correspond à l'adresse (dossier app/).
// On passe par ce fichier pour charger quelques réglages AVANT tout le reste de l'appli : les
// imports s'exécutent dans l'ordre où ils sont écrits.
import './src/strict-browser'
// Le relais du Retour du navigateur doit être posé avant Expo Router : Chromium appelle les
// écouteurs de `popstate` dans l'ordre de pose (voir src/navigation/backRelay.ts).
import './src/navigation/backRelay'
// Le relais des passages de page (R17) : il doit remplacer l'entonnoir des navigations d'Expo Router
// avant que l'appli ne démarre, et s'inscrire au relais du Retour (voir src/navigation/passageRelay.ts).
import './src/navigation/passageRelay'
import { Platform } from 'react-native'
import { preparePageLanguage } from './src/i18n'

// Démarre l'appli : Expo Router affiche la page de l'adresse (sur le web, il « hydrate » le HTML
// pré-rendu). Un `require` plutôt qu'un `import` en tête : il ne s'exécute qu'à l'appel, et le
// module reste dans le script de départ (un `import()` en ferait un morceau à part, à télécharger
// en plus).
const start = () => {
  require('expo-router/entry')
}

// R18 : sur le web, l'anglais n'est plus dans le script de départ. Une page anglaise (`/en/…`, ou une
// page sans langue pour un navigateur anglais) attend son morceau avant l'hydratation : le premier
// rendu retrouve le texte du HTML pré-rendu (voir preparePageLanguage dans src/i18n.ts). Une page
// française n'attend rien. Sur téléphone, tout est déjà dans l'appli : on démarre tout de suite,
// sans attendre une promesse. `start` aussi en cas d'erreur imprévue : jamais une page sans appli.
if (Platform.OS === 'web') void preparePageLanguage().then(start, start)
else start()
