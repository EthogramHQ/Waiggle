// La section « Pages légales » du catalogue (tranche R11, planches R11-Pages, R11-Pages-Nuit,
// R11-Pages-Desktop et R11-Pied) : le corps d'une page légale (LegalDocument), sur téléphone et sur
// ordinateur, de jour et de nuit, et les liens vers les quatre pages (LegalLinks) : le pied de
// l'accueil, le pied d'une des pages, les lignes des réglages. Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne : le catalogue est partagé par toute l'interface. Ses exemples (un
// outil de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { IconName } from '../ui/Icon'
import { LegalDocument, type LegalSection } from '../ui/LegalDocument'
import { LegalLinks } from '../ui/LegalLinks'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Pages légales',
  phone: 'Le corps d’une page, sur téléphone (le titre de la page est posé par l’écran)',
  computer: 'Sur ordinateur : le « Sommaire » à gauche, qui suit la partie lue',
  computerOnly: 'Le « Sommaire » se montre dans une fenêtre d’ordinateur.',
  day: 'jour',
  night: 'nuit',
  footerHome: 'Le pied de l’accueil et de la connexion : les quatre pages et le code source',
  footerPage: 'Le pied de la page Confidentialité : les trois autres pages et l’adresse de contact',
  rows: 'Les lignes « À propos » des réglages',
  summary: [
    { icon: 'eye-slash', text: 'Ni publicité, ni cookie de mesure.' },
    { icon: 'envelope-simple', text: 'Aucun membre ne voit ton adresse e‑mail.' },
    {
      icon: 'globe-simple',
      text: 'Le serveur et les e‑mails sont à Paris. Seul l’assistant de code peut lire des extraits hors de l’Union européenne.',
    },
    { icon: 'download-simple', text: 'Tu peux tout télécharger ou tout supprimer.' },
  ],
  sections: [
    {
      id: 'controller',
      title: 'Qui est responsable',
      body: 'L’éditeur, présenté dans les Mentions légales.',
    },
    {
      id: 'durations',
      title: 'Combien de temps',
      body: '- **Ton compte** : tant qu’il existe.\n- **Un compte inactif** : 3 ans.\n- **Les sauvegardes** : 14 jours.',
    },
    {
      id: 'rights',
      title: 'Tes droits',
      body: 'Tu peux tout télécharger ou tout supprimer depuis tes réglages. Tu peux aussi saisir la [CNIL](https://www.cnil.fr).',
    },
    {
      id: 'cookies',
      title: 'Les cookies',
      body: 'Un seul cookie, celui de ta session. Aucun cookie de mesure ni de publicité.',
    },
  ],
}

const en: typeof fr = {
  title: 'Legal pages',
  phone: 'The body of a page, on a phone (the page title is set by the screen)',
  computer: 'On a computer: the “Contents” on the left, following the part being read',
  computerOnly: 'The “Contents” shows in a computer window.',
  day: 'day',
  night: 'night',
  footerHome: 'The footer of home and sign-in: the four pages and the source code',
  footerPage: 'The footer of the Privacy page: the three other pages and the contact address',
  rows: 'The “About” rows of the settings',
  summary: [
    { icon: 'eye-slash', text: 'No ads, no tracking cookie.' },
    { icon: 'envelope-simple', text: 'No member sees your e‑mail address.' },
    {
      icon: 'globe-simple',
      text: 'The server and the e‑mails are in Paris. Only the coding assistant may read excerpts outside the European Union.',
    },
    { icon: 'download-simple', text: 'You can download or delete everything.' },
  ],
  sections: [
    {
      id: 'controller',
      title: 'Who is responsible',
      body: 'The publisher, presented in the Legal notice.',
    },
    {
      id: 'durations',
      title: 'For how long',
      body: '- **Your account**: as long as it exists.\n- **An inactive account**: 3 years.\n- **Backups**: 14 days.',
    },
    {
      id: 'rights',
      title: 'Your rights',
      body: 'You can download or delete everything from your settings. You can also contact the [CNIL](https://www.cnil.fr).',
    },
    {
      id: 'cookies',
      title: 'Cookies',
      body: 'A single cookie, the one of your session. No tracking or advertising cookie.',
    },
  ],
}

/** Le catalogue n'ouvre rien : un lien du texte touché ne fait rien. */
const noop = () => {}

const schemes = ['day', 'night'] as const

export function LegalPagesCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const { sizeClass } = useLayout()
  const summary = l.summary as { icon: IconName; text: string }[]
  const sections: LegalSection[] = l.sections
  const document = (wide: boolean) => (
    <LegalDocument
      version="2026-11-16"
      summary={summary}
      sections={sections}
      wide={wide}
      onLinkPress={noop}
    />
  )
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.footerHome} — ${l[scheme]}`}>
              <LegalLinks variant="footer" />
            </Example>
            <Example caption={`${l.footerPage} — ${l[scheme]}`}>
              <LegalLinks variant="footer" current="privacy" />
            </Example>
            <Example caption={`${l.rows} — ${l[scheme]}`}>
              <LegalLinks variant="rows" />
            </Example>
            <Example caption={`${l.phone} — ${l[scheme]}`} narrow>
              {document(false)}
            </Example>
            <Example caption={`${l.computer} — ${l[scheme]}`}>
              {/* Le sommaire et le texte côte à côte ne tiennent pas sur un téléphone. */}
              {sizeClass === 'wide' ? (
                document(true)
              ) : (
                <Text variant="caption" tone="muted">
                  {l.computerOnly}
                </Text>
              )}
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple sur le fond de son thème ; `narrow` : à la largeur d'un téléphone. */
function Example({
  caption,
  children,
  narrow = false,
}: {
  caption: string
  children: ReactNode
  narrow?: boolean
}) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {/* La largeur d'un téléphone (390 points), sans déborder d'un catalogue plus étroit. */}
      {narrow ? <View style={{ width: '100%', maxWidth: 390 }}>{children}</View> : children}
    </Surface>
  )
}
