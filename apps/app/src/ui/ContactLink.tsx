// Le lien vers notre adresse de contact (R9, scénario « L'adresse de contact, partout un lien ») :
// toucher l'adresse ouvre l'appli de messagerie du membre sur un brouillon déjà adressé, avec, s'il
// y en a un, un objet tout prêt (« Contestation : retrait de la photo 2 de « Météo » du 12 nov. »).
//
// L'adresse vient de @ruche/brand, et de nulle part ailleurs. Le lien s'ouvre sans la page « Tu
// quittes… », réservée aux sites tiers (`design.md`, 7a) : c'est notre propre adresse.
import { contactEmail } from '@ruche/brand'
import { Linking } from 'react-native'
import { TextLink } from './TextLink'
import { useTapGuard } from './tapGuard'

type Props = {
  /**
   * L'objet du brouillon (« Contester » nomme la décision contestée, J12). Il peut contenir un
   * titre écrit par un membre : il est codé en entier, pour qu'un « & » ou un « ?bcc= » reste du
   * texte et n'ajoute jamais un champ (un destinataire caché) au message.
   */
  subject?: string
  /**
   * Le texte du lien, s'il n'est pas l'adresse (« Contester ») ; il en devient aussi le nom lu
   * (WCAG 2.5.3 : le nom suit ce qui est affiché). Par défaut, l'adresse elle-même.
   */
  children?: string
}

/**
 * L'adresse `mailto:` ouverte. `encodeURIComponent` code les espaces en `%20` (et non en `+`,
 * que les messageries laisseraient tels quels, RFC 6068), les guillemets, `&`, `?` et `=`.
 */
export const contactMailto = (subject?: string): string =>
  subject
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`
    : `mailto:${contactEmail}`

export function ContactLink({ subject, children }: Props) {
  // Une double tape ouvrirait deux brouillons : la seconde tombe dans la garde (600 ms).
  const guard = useTapGuard()
  const label = children ?? contactEmail
  return (
    <TextLink
      label={label}
      // Une adresse n'a pas d'espace : sans coupure possible, elle sortirait du cadre sur un petit
      // téléphone, à 200 % de texte. Un autre texte (« Contester ») se coupe entre ses mots.
      breakAnywhere={children === undefined}
      onPress={guard(() => void Linking.openURL(contactMailto(subject)))}
    />
  )
}
