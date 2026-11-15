// Les liens vers les quatre pages publiques (tranche R11, planche R11-Pied) : Règles,
// Confidentialité, Mentions légales, Accessibilité, et « Le code source ». Deux allures :
// - `footer` : une rangée de liens qui passe à la ligne, en pied de l'accueil des visiteurs, de la
//   connexion et des quatre pages elles-mêmes ;
// - `rows` : les lignes « À propos » des réglages, une ligne par page.
//
// Chaque page a sa vraie adresse (`href` : « /rules »…) : sur le web, react-native-web dessine un
// vrai `<a>`, que le navigateur ouvre dans un onglet et que les moteurs de recherche suivent. Le
// geste ordinaire passe par le routeur d'Expo Router, qui change de page sans la recharger (comme
// `SettingsNav`, l'autre composant de src/ui qui touche à expo-router).
//
// « Le code source » est un site extérieur : il passe par la page d'avertissement « Tu quittes… »
// (`/out`), comme tout lien qui quitte l'appli. Au pied d'une des quatre pages (`current`), il
// laisse la place à l'adresse de contact (option 7 des planches R11) : on y cherche à qui écrire.
import { contactEmail, layout, sourceUrl, space } from '@ruche/brand'
import { LEGAL_PAGES, type LegalPage } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Linking, Platform, Pressable, View } from 'react-native'
import { contactMailto } from './ContactLink'
import { Icon, type IconName } from './Icon'
import { enterActivates } from './keyboard'
import { ListGroup, ListRow, type PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Text } from './Text'

type Props = {
  /** `footer` : la rangée du pied ; `rows` : les lignes des réglages. */
  variant: 'footer' | 'rows'
  /**
   * La page lue, quand le pied est celui d'une des quatre pages : elle n'a pas de lien vers
   * elle-même, et l'adresse de contact remplace « Le code source ».
   */
  current?: LegalPage
}

/** L'icône de chaque page dans les lignes des réglages (décorative : le nom dit tout). */
const pageIcons: Record<LegalPage, IconName> = {
  rules: 'book-open',
  privacy: 'lock-simple',
  legal: 'info',
  accessibility: 'eye',
}

/** L'adresse de la page « Tu quittes… » pour le dépôt du code (sa vraie adresse, pour `href`). */
const sourceHref = `/out?url=${encodeURIComponent(sourceUrl)}`

export function LegalLinks({ variant, current }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const pages = LEGAL_PAGES.filter((page) => page !== current)
  const names: Record<LegalPage, string> = {
    rules: t(($) => $.legal.links.rules),
    privacy: t(($) => $.legal.links.privacy),
    legal: t(($) => $.legal.links.legal),
    accessibility: t(($) => $.legal.links.accessibility),
  }
  const sourceCode = t(($) => $.legal.links.sourceCode)

  // Le geste sur un lien à adresse : sur le web, le navigateur ne recharge pas la page
  // (preventDefault sur le clic du `<a>`), et le routeur change de page.
  const open = (href: string) => (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    router.push(href)
  }
  const openSource = (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    router.push({ pathname: '/out', params: { url: sourceUrl } })
  }

  if (variant === 'rows') {
    return (
      <ListGroup>
        {pages.map((page) => (
          <ListRow
            key={page}
            label={names[page]}
            icon={pageIcons[page]}
            trailing="chevron"
            href={`/${page}`}
            onPress={open(`/${page}`)}
          />
        ))}
        {current ? null : (
          <ListRow
            label={sourceCode}
            icon="code"
            hint={t(($) => $.common.externalSite)}
            trailing="arrow-up-right"
            href={sourceHref}
            onPress={openSource}
          />
        )}
      </ListGroup>
    )
  }

  const mailto = contactMailto()
  return (
    // Une région de navigation nommée : les lecteurs d'écran la proposent dans la liste des
    // repères de la page (« Les pages de Waiggle »).
    <View
      role="navigation"
      aria-label={t(($) => $.legal.links.label)}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space.lg,
        // maxWidth et flexShrink : sur le web, une rangée ne rétrécit pas d'elle-même (320 points,
        // texte à 200 %).
        maxWidth: '100%',
        flexShrink: 1,
      }}
    >
      {pages.map((page) => (
        <FooterLink key={page} label={names[page]} href={`/${page}`} onPress={open(`/${page}`)} />
      ))}
      {current ? (
        <FooterLink
          label={contactEmail}
          // Le nom lu dit ce que fait le lien ; l'adresse seule est affichée (WCAG 2.5.3 : le nom
          // contient le texte affiché).
          spokenLabel={t(($) => $.legal.links.contact, { contactEmail })}
          icon="envelope-simple"
          href={mailto}
          breakAnywhere
          // Sur le web, le `<a href="mailto:">` ouvre la messagerie de lui-même ; ailleurs, on la
          // demande à l'appareil.
          onPress={() => {
            if (Platform.OS !== 'web') void Linking.openURL(mailto)
          }}
        />
      ) : (
        <FooterLink
          label={sourceCode}
          spokenLabel={
            Platform.OS === 'web' ? `${sourceCode}, ${t(($) => $.common.externalSite)}` : sourceCode
          }
          trailingIcon="arrow-up-right"
          href={sourceHref}
          onPress={openSource}
        />
      )}
    </View>
  )
}

type FooterLinkProps = {
  label: string
  /** Le nom lu, s'il diffère du texte affiché (il le contient toujours). */
  spokenLabel?: string
  href: string
  onPress: (event?: PressEvent) => void
  /** Une icône avant le texte (l'enveloppe de l'adresse de contact). */
  icon?: IconName
  /** Une icône après le texte (la flèche d'un site extérieur). */
  trailingIcon?: IconName
  /** Le texte peut se couper n'importe où (une adresse, sans espace). */
  breakAnywhere?: boolean
}

/** Un lien du pied : texte souligné, 44 points de haut, sa vraie adresse. */
function FooterLink({
  label,
  spokenLabel,
  href,
  onPress,
  icon,
  trailingIcon,
  breakAnywhere = false,
}: FooterLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spokenLabel ?? label}
      {...linkProps(href, false)}
      // Entrée ouvre le lien sur le web même quand le routeur intercepte le clic (keyboard.ts).
      {...enterActivates(onPress)}
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
