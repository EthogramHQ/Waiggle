// Un lien du pied des pages publiques (tranche R11, planche R11-Pied ; R12, planche
// R12-Visiteur-Desktop) : un texte souligné, 44 points de haut, avec sa vraie adresse. Le pied
// (`LegalLinks`) en aligne plusieurs ; le lien vers l'autre langue (`LanguageLink`) en est un aussi.
// Un seul dessin pour les deux, pour que le pied reste d'une seule allure.
import { layout, space } from '@ruche/brand'
import type { Language } from '@ruche/i18n'
import { Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { enterActivates } from './keyboard'
import type { PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Text } from './Text'

type Props = {
  label: string
  /** Le nom lu, s'il diffère du texte affiché (il le contient toujours). */
  spokenLabel?: string
  /** L'indice lu après le nom, sur téléphone seulement (sur le web, le nom lu le porte déjà). */
  nativeHint?: string
  href: string
  onPress: (event?: PressEvent) => void
  /** Une icône avant le texte (l'enveloppe de l'adresse de contact, le signe des langues). */
  icon?: IconName
  /** Une icône après le texte (la flèche d'un site extérieur). */
  trailingIcon?: IconName
  /** Le texte peut se couper n'importe où (une adresse, sans espace). */
  breakAnywhere?: boolean
  /**
   * Sur le web, le navigateur ouvre le lien lui-même (`mailto:`) : Entrée lui est laissée. Un
   * gestionnaire d'Entrée ferait `preventDefault` et l'annulerait, sans rien ouvrir à sa place
   * (relecture de design de R11, WCAG 2.1.1).
   */
  browserOpens?: boolean
  /**
   * La langue du texte du lien, quand ce n'est pas celle de la page (« English » sur une page en
   * français) : le lecteur d'écran le prononce alors avec la bonne voix (WCAG 3.1.2).
   */
  lang?: Language
}

/**
 * L'attribut `lang` du lien. Les types de React Native ne le connaissent pas (il n'existe pas sur
 * téléphone) ; react-native-web l'écrit tel quel sur la balise `<a>`. D'où un objet étalé, comme
 * `linkProps` pour `href`.
 */
const langProps = (lang: Language | undefined): object => (lang ? { lang } : {})

export function FooterLink({
  label,
  spokenLabel,
  nativeHint,
  href,
  onPress,
  icon,
  trailingIcon,
  breakAnywhere = false,
  browserOpens = false,
  lang,
}: Props) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spokenLabel ?? label}
      {...(nativeHint && Platform.OS !== 'web' ? { accessibilityHint: nativeHint } : null)}
      {...linkProps(href, false)}
      {...langProps(lang)}
      // Entrée ouvre le lien sur le web même quand le routeur intercepte le clic (keyboard.ts) ;
      // un lien que le navigateur ouvre seul garde son Entrée native.
      {...(browserOpens ? null : enterActivates(onPress))}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        // La zone à toucher : 44 points de haut, même autour d'un mot court.
        minHeight: layout.touchTarget,
        maxWidth: '100%',
        flexShrink: 1,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon ? (
        // Une vue autour du dessin : sur le web, un dessin seul rétrécit quand le texte est long.
        <View aria-hidden style={{ flexShrink: 0 }}>
          <Icon name={icon} size={16} tone="secondary" />
        </View>
      ) : null}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text
          variant="callout"
          weight={600}
          tone="secondary"
          underline
          breakAnywhere={breakAnywhere}
        >
          {label}
        </Text>
      </View>
      {trailingIcon ? (
        <View aria-hidden style={{ flexShrink: 0 }}>
          <Icon name={trailingIcon} size={14} tone="secondary" />
        </View>
      ) : null}
    </Pressable>
  )
}
