// Mise en page des pages publiques à adresse par langue (« /fr/… », « /en/… », tranche R12, choix 7
// du plan) : l'accueil, un projet public et ses mises à jour, une page publique, les quatre pages de
// R11. [lang] dans le nom du dossier : cette partie de l'adresse est variable, et
// useLocalSearchParams la lit.
//
// Elle fait trois choses :
// - elle n'accepte que `fr` et `en` : « /de/ » ou « /xyz/rules » montrent la page introuvable ;
// - elle donne à la page la langue de l'adresse, pour un visiteur, dès le premier rendu
//   (src/navigation/PageLanguage.tsx) ;
// - elle demande à Expo Router de préparer chaque page dans les deux langues (ci-dessous).
import { supportedLanguages } from '@ruche/i18n'
import { Stack, useLocalSearchParams } from 'expo-router'
import { PageLanguage } from '../../src/navigation/PageLanguage'
import { firstParam } from '../../src/navigation/params'
import { NotFoundScreen } from '../../src/screens/NotFoundScreen'
import { usePageStackOptions } from '../../src/ui/AmbientHost'

/**
 * Les valeurs de `[lang]` à préparer en HTML à la construction du site (`expo export`, sortie
 * `static`) : une copie de chaque page en français (`fr/…`) et une en anglais (`en/…`), écrite dans
 * sa langue (relecture du plan, B1). Seulement les deux langues : jamais un projet ni un membre, dont
 * le titre se retrouverait dans le HTML (src/screens/html.test.tsx). Expo Router garde aussi une
 * copie générique `[lang]`, que le serveur ne sert jamais (Caddy, check-web.mjs).
 */
export function generateStaticParams(): { lang: string }[] {
  return supportedLanguages.map((lang) => ({ lang }))
}

export default function LanguageLayout() {
  const { lang } = useLocalSearchParams<{ lang: string }>()
  const value = firstParam(lang)
  const language = supportedLanguages.find((candidate) => candidate === value)
  // Une langue que l'appli ne connaît pas : ce n'est pas une page de l'appli.
  if (!language) return <NotFoundScreen />
  return (
    <PageLanguage language={language}>
      <LanguageStack />
    </PageLanguage>
  )
}

/** La pile des pages d'une langue, réglée comme celle de la racine (sans en-tête, même fond). */
function LanguageStack() {
  const screenOptions = usePageStackOptions()
  return <Stack screenOptions={screenOptions} />
}
