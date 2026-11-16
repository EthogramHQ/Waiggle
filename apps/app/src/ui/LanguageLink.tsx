// Le lien vers la même page dans l'autre langue (tranche R12, scénario « Les adresses par langue »,
// planche R12-Visiteur-Desktop) : au pied d'une page publique, « English » sur `/fr/…`, « Français »
// sur `/en/…`. Le nom de la langue est écrit dans cette langue, et le lien porte l'attribut `lang`
// de la langue d'arrivée : un lecteur d'écran dit « English » avec une voix anglaise.
//
// Une page sans langue dans l'adresse (`/`, le Fil, les réglages) n'a pas d'autre adresse :
// le lien n'y est pas (`otherLanguagePath` rend null). Là, c'est le choix « FR / EN »
// (`LanguageSwitcher`) qui reste (plan R12, décision 16).
//
// Sur le web, le lien n'apparaît qu'une fois la page hydratée (`useHydrated`, voir
// theme/hydration.ts) : il dépend de l'adresse lue dans le navigateur, et la page pré-rendue doit
// être identique au premier affichage (plan R12, décision 16).
import type { Language } from '@ruche/i18n'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { languageOfPath, otherLanguagePath } from '../navigation/publicPath'
import { FooterLink } from './FooterLink'
import type { PressEvent } from './ListGroup'
import { useHydrated } from './theme/hydration'

type Props = {
  /**
   * L'adresse de la page dont on veut l'autre langue ; par défaut, celle de la page affichée. Le
   * catalogue la donne, lui qui n'a pas d'adresse à langue.
   */
  path?: string
}

export function LanguageLink({ path }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const hydrated = useHydrated()
  const href = otherLanguagePath(path ?? pathname)
  const target: Language | null = href === null ? null : languageOfPath(href)
  if (!hydrated || href === null || target === null) return null

  // Le nom de chaque langue est le même dans les deux fichiers de textes, écrit dans sa propre
  // langue (« English », « Français ») : on le lit donc dans la langue de la page. La clé est
  // recopiée dans une constante : le sélecteur ne garde pas le rétrécissement de `target`.
  const language: Language = target
  const name = t(($) => $.common.languages[language])

  // Le geste ordinaire passe par le routeur (pas de rechargement) ; sur le web, le clic du `<a>`
  // n'ouvre pas la page une seconde fois (preventDefault).
  const open = (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    router.push(href)
  }

  return <FooterLink label={name} icon="translate" href={href} onPress={open} lang={target} />
}
