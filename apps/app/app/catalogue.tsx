// Page de développement : le catalogue des composants (voir src/catalogue/CatalogueScreen.tsx).
// Elle n'existe qu'en développement, ou quand on construit l'appli pour les captures automatiques
// (EXPO_PUBLIC_CATALOGUE=1, voir scripts/shots.mjs). Dans l'appli publiée : « page introuvable ».
import { Unmatched } from 'expo-router'
import { CatalogueScreen } from '../src/catalogue/CatalogueScreen'

const enabled = __DEV__ || process.env.EXPO_PUBLIC_CATALOGUE === '1'

export default function CataloguePage() {
  return enabled ? <CatalogueScreen /> : <Unmatched />
}
