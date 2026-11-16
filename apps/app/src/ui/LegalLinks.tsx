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
// R12 (« Les adresses par langue », plan R12, décision 16) : sur une page publique à langue
// (`/fr/…`, `/en/…`), les quatre pages gardent la langue de l'adresse (`/en/rules`) ; ailleurs
// (pages des membres, réglages), leurs adresses d'avant (`/rules`). Le pied d'une page publique
// gagne aussi « Signaler un contenu » (`report`) et le lien vers la même page dans l'autre langue
// (`otherLanguage`, voir LanguageLink.tsx), rangé au bout de la ligne (planche R12-Visiteur-Desktop).
//
// « Le code source » est un site extérieur : il passe par la page d'avertissement « Tu quittes… »
// (`/out`), comme tout lien qui quitte l'appli. Au pied d'une des quatre pages (`current`), il
// laisse la place à l'adresse de contact (option 7 des planches R11) : on y cherche à qui écrire.
import { contactEmail, sourceUrl, space } from '@ruche/brand'
import { LEGAL_PAGES, type LegalPage } from '@ruche/contracts'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Linking, Platform, View } from 'react-native'
import { languageOfPath, publicPath } from '../navigation/publicPath'
import { contactMailto } from './ContactLink'
import { FooterLink } from './FooterLink'
import type { IconName } from './Icon'
import { LanguageLink } from './LanguageLink'
import { ListGroup, ListRow, type PressEvent } from './ListGroup'

type Props = {
  /** `footer` : la rangée du pied ; `rows` : les lignes des réglages. */
  variant: 'footer' | 'rows'
  /**
   * La page lue, quand le pied est celui d'une des quatre pages : elle n'a pas de lien vers
   * elle-même, et l'adresse de contact remplace « Le code source ».
   */
  current?: LegalPage
  /**
   * Le pied d'une page qu'un visiteur lit (R12) : « Signaler un contenu », qui écrit à l'adresse de
   * contact (un visiteur n'a pas le « Signaler » d'un membre sur chaque contenu de cette page).
   */
  report?: boolean
  /**
   * Le lien vers la même page dans l'autre langue (R12), au bout de la rangée. Il ne se montre que
   * sur une adresse à langue (`/fr/…`), et seulement à un visiteur : un membre lit les pages dans la
   * langue de son appli, l'autre adresse ne changerait rien pour lui.
   */
  otherLanguage?: boolean
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

export function LegalLinks({ variant, current, report = false, otherLanguage = false }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  // La langue de l'adresse lue (`/en/projects/…` → `en`), ou null hors d'une page publique à langue.
  const language = languageOfPath(usePathname())
  const pages = LEGAL_PAGES.filter((page) => page !== current)
  const names: Record<LegalPage, string> = {
    rules: t(($) => $.legal.links.rules),
    privacy: t(($) => $.legal.links.privacy),
    legal: t(($) => $.legal.links.legal),
    accessibility: t(($) => $.legal.links.accessibility),
  }
  const sourceCode = t(($) => $.legal.links.sourceCode)
  /** L'adresse d'une des quatre pages : dans la langue de la page lue, s'il y en a une. */
  const hrefOf = (page: LegalPage) => (language ? publicPath(page, language) : `/${page}`)

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
            href={hrefOf(page)}
            onPress={open(hrefOf(page))}
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
  // Sur le web, le `<a href="mailto:">` ouvre la messagerie de lui-même, à Entrée comme au clic ;
  // ailleurs, on la demande à l'appareil.
  const writeToUs = () => {
    if (Platform.OS !== 'web') void Linking.openURL(mailto)
  }
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
        <FooterLink
          key={page}
          label={names[page]}
          href={hrefOf(page)}
          onPress={open(hrefOf(page))}
        />
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
          browserOpens
          onPress={writeToUs}
        />
      ) : (
        <FooterLink
          label={sourceCode}
          spokenLabel={
            Platform.OS === 'web' ? `${sourceCode}, ${t(($) => $.common.externalSite)}` : sourceCode
          }
          // Sur téléphone, le lecteur d'écran lit l'indice après le nom (comme TextLink `external`) :
          // il sait aussi que le lien quitte l'appli.
          nativeHint={t(($) => $.common.externalSite)}
          trailingIcon="arrow-up-right"
          href={sourceHref}
          onPress={openSource}
        />
      )}
      {report ? (
        // Après « Le code source », comme sur la planche : la même adresse que le contact de R11.
        <FooterLink
          label={t(($) => $.legal.links.report)}
          href={mailto}
          browserOpens
          onPress={writeToUs}
        />
      ) : null}
      {otherLanguage ? (
        // Au bout de la rangée (marge automatique à gauche) : à droite sur ordinateur ; quand la
        // rangée passe à la ligne sur téléphone, au bout de sa propre ligne.
        <View style={{ marginLeft: 'auto', maxWidth: '100%', flexShrink: 1 }}>
          <LanguageLink />
        </View>
      ) : null}
    </View>
  )
}
