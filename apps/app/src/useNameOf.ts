// Le nom d'un membre relié au texte, dans la langue affichée : « Voir la page d’Inès », « de Léa »,
// « See Inès’s page » (le paramètre {{nameOf}} des textes, tranche 6c). La règle elle-même est
// `nameOf`, dans @ruche/i18n, partagée avec les e-mails de l'API.
import { nameOf, resolveLanguage } from '@ruche/i18n'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Hook : rend une fonction `(nom) => « d’Inès »` qui suit la langue de l'appli. Il évite de répéter
 * `resolveLanguage([i18n.language])` dans chaque écran : la langue d'i18next peut être une variante
 * régionale (« en-US »), que `nameOf` ne connaît pas ; l'oublier donnerait « de Léa » en anglais.
 * useCallback garde la même fonction tant que la langue ne change pas.
 */
export const useNameOf = () => {
  const { i18n } = useTranslation()
  const language = resolveLanguage([i18n.language])
  return useCallback((name: string) => nameOf(language, name), [language])
}
