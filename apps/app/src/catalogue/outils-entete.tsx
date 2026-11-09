// La section « Outils : l'en-tête d'une page » du catalogue (tranche R6b, U2c) : ToolHeader dans
// tous ses états. Sur téléphone (390 points, nom de 64) et sur ordinateur (nom de 100) ; complet,
// sans description, sans site, sans les deux ; un nom très long, qui rétrécit sur une ligne, et à
// 320 points. Jour et nuit ; le lien du site passe par `onPress`, que l'écran branche sur la page
// « Tu quittes Waiggle » (ici, il ne fait rien).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes de l'en-tête viennent de l'appli.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ToolHeader } from '../ui/ToolHeader'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Outils : l’en-tête d’une page',
  intro:
    'ToolHeader : le nom en très grand, titre de niveau 1 de la page, avec la tuile à son initiale ; « 34 projets · Sans code » ; la description ; qui l’a écrite ; et le site, un lien nommé par son hôte qui passe par la page de sortie. Un nom long rétrécit pour tenir sur une ligne.',
  phone: 'Téléphone (390 points) : complet',
  phoneNarrow: 'Téléphone à 320 points : un nom long',
  noDescription: 'Sans description',
  noSite: 'Sans site',
  bare: 'Sans description ni site',
  wide: 'Ordinateur : complet',
  wideLong: 'Ordinateur : un nom long',
  description: 'Un outil qui écrit une application web à partir d’une description.',
  longName: 'Assistant de création d’applications',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Tools: a page header',
  intro:
    'ToolHeader: the name very large, the page’s level 1 heading, with a tile showing its initial; “34 projects · No code”; the description; who wrote it; and the site, a link named by its host that goes through the leaving page. A long name shrinks to stay on one line.',
  phone: 'Phone (390 points): complete',
  phoneNarrow: 'Phone at 320 points: a long name',
  noDescription: 'No description',
  noSite: 'No site',
  bare: 'No description and no site',
  wide: 'Desktop: complete',
  wideLong: 'Desktop: a long name',
  description: 'A tool that writes a web app from a description.',
  longName: 'Application building assistant',
  day: 'day',
  night: 'night',
}

const noop = () => {}

export function ToolHeaderCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  // Les textes que l'écran passerait : nombre, famille, avertissement viennent de l'appli.
  const common = {
    projects: t(($) => $.tools.projects, { count: 34 }),
    family: t(($) => $.tools.family['no-code']),
    disclaimer: t(($) => $.tool.disclaimer),
  }
  const site = { host: 'lovable.dev', onPress: noop }
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.phone} — ${l[scheme]}`} width={390}>
              <ToolHeader
                {...common}
                name="Lovable"
                description={l.description}
                site={site}
                layout="phone"
              />
            </Example>
            <Example caption={`${l.phoneNarrow} — ${l[scheme]}`} width={320}>
              <ToolHeader
                {...common}
                name={l.longName}
                description={l.description}
                site={site}
                layout="phone"
              />
            </Example>
            <Example caption={`${l.noDescription} — ${l[scheme]}`} width={390}>
              <ToolHeader {...common} name="Cursor" description={null} site={site} layout="phone" />
            </Example>
            <Example caption={`${l.noSite} — ${l[scheme]}`} width={390}>
              <ToolHeader
                {...common}
                name="Replit"
                description={l.description}
                site={null}
                layout="phone"
              />
            </Example>
            <Example caption={`${l.bare} — ${l[scheme]}`} width={390}>
              <ToolHeader {...common} name="Autre" description={null} site={null} layout="phone" />
            </Example>
            <Example caption={`${l.wide} — ${l[scheme]}`}>
              <ToolHeader
                {...common}
                name="Lovable"
                description={l.description}
                site={site}
                layout="wide"
              />
            </Example>
            <Example caption={`${l.wideLong} — ${l[scheme]}`}>
              <ToolHeader
                {...common}
                name={l.longName}
                description={l.description}
                site={site}
                layout="wide"
              />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème, à une largeur donnée. */
function Example({
  caption,
  width,
  children,
}: {
  caption: string
  width?: number
  children: ReactNode
}) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {/* Une colonne de la largeur d'un téléphone, jamais plus large que la page. */}
      <View style={width === undefined ? null : { width, maxWidth: '100%' }}>{children}</View>
    </Surface>
  )
}
