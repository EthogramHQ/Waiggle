// Page de développement : le catalogue des composants (voir src/catalogue/CatalogueScreen.tsx).
// Elle n'existe qu'en développement, ou quand on construit l'appli pour les captures automatiques
// (EXPO_PUBLIC_CATALOGUE=1, voir scripts/shots.mjs). Dans l'appli publiée : « page introuvable ».
//
// R13 : le catalogue n'est jamais dans le script de l'appli publiée. Un `import` en tête de fichier
// y laissait ses cent fichiers, même inutilisés. Ici, `require` n'est écrit que dans la branche de la
// condition : à la construction, `__DEV__` et `process.env.EXPO_PUBLIC_CATALOGUE` sont remplacés par
// leur valeur, la condition devient fausse et la branche morte est retirée avant que Metro relève
// les modules à empaqueter. La condition reste écrite ici, en entier : rangée dans une constante,
// elle ne serait peut-être plus évaluée à la construction. (`infra/web/check-web.mjs` vérifie que
// le texte du catalogue est absent de tout le JavaScript construit.)
import { Unmatched } from 'expo-router'
import type { ComponentType } from 'react'

const CatalogueScreen: ComponentType | null =
  __DEV__ || process.env.EXPO_PUBLIC_CATALOGUE === '1'
    ? (
        require('../src/catalogue/CatalogueScreen') as typeof import('../src/catalogue/CatalogueScreen')
      ).CatalogueScreen
    : null

export default function CataloguePage() {
  return CatalogueScreen ? <CatalogueScreen /> : <Unmatched />
}
