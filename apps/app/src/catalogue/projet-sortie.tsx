// La section « Page de sortie » du catalogue (tranche R5a) : la feuille de « Tu quittes Waiggle
// pour… » (ui/LeavingSheet.tsx) posée sur le miel vif sous le portail, comme dans l'appli, dans ses
// états : sans la ligne « La démo de … » (un lien venu d'ailleurs), avec elle (la démo d'un projet),
// et sa place gardée, vide, pendant que le projet se lit ; de jour et de nuit, puis sur ordinateur
// (le portail à gauche de la carte, `hero`).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés d'exemple (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes de la feuille sont ceux de l'appli.
import { radii } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { BrandAmbiance } from '../ui/BrandAmbiance'
import { PortalRings } from '../ui/Illustrations'
import { type LeavingOrigin, LeavingSheet } from '../ui/LeavingSheet'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Page de sortie',
  intro:
    'Ce qu’on lit avant de quitter Waiggle : le nom du site en grand, son adresse complète, l’encadré de prudence, puis « Ouvrir le site » et « Rester sur Waiggle ». La ligne « La démo de … » ne paraît que si le lien est exactement la démo d’un projet relu auprès de l’API ; pendant cette lecture, sa place est gardée, vide, pour que les boutons ne bougent pas.',
  without: 'Lien venu d’ailleurs : sans la ligne',
  with: 'Démo d’un projet : avec la ligne',
  holding: 'Projet en lecture : place gardée',
  desktop: 'Ordinateur : le portail à gauche de la carte (`hero`)',
  day: 'jour',
  night: 'nuit',
  origin: 'La démo de Carnet de cafés, ajoutée par Léa Moreau',
}

const en: typeof fr = {
  title: 'Leaving page',
  intro:
    'What you read before leaving Waiggle: the site’s name in large type, its full address, the word of caution, then “Open the site” and “Stay on Waiggle”. The line “The demo of …” only appears when the link is exactly the demo of a project read back from the API; while it is read, its place is kept, empty, so that the buttons do not move.',
  without: 'Link from elsewhere: no line',
  with: 'A project’s demo: with the line',
  holding: 'Project being read: place kept',
  desktop: 'Computer: the portal left of the card (`hero`)',
  day: 'day',
  night: 'night',
  origin: 'The demo of Coffee notebook, added by Léa Moreau',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const
const host = 'carnet-cafes.vercel.app'
const href = 'https://carnet-cafes.vercel.app/essai'

/** Un cadre arrondi, comme l'écran d'un appareil, qui rogne ce qui dépasse (le décor déborde). */
function Frame({ width, children }: { width?: number; children: ReactNode }) {
  return (
    <View style={{ width: width ?? '100%', maxWidth: '100%' }}>
      <Surface padding="none" radius="tile">
        <View style={{ overflow: 'hidden', borderRadius: radii.tile }}>{children}</View>
      </Surface>
    </View>
  )
}

/** Un exemple légendé (« Avec la ligne — nuit »). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      {children}
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

/** La feuille dans l'un de ses états, sur le miel d'un téléphone, sous le portail. */
function Phone({
  origin,
  holdOrigin = false,
}: {
  origin: LeavingOrigin | null
  holdOrigin?: boolean
}) {
  return (
    <Frame width={390}>
      <BrandAmbiance size="compact" scene={<PortalRings />}>
        <LeavingSheet
          host={host}
          href={href}
          origin={origin}
          holdOrigin={holdOrigin}
          onOpen={noop}
          onStay={noop}
        />
      </BrandAmbiance>
    </Frame>
  )
}

export function LeavingCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const origin: LeavingOrigin = { text: l.origin, author: { name: 'Léa Moreau', source: null } }
  // Côte à côte sur un écran large ; l'un sous l'autre ailleurs (un cadre de 390 points déborderait
  // d'une rangée dans un catalogue de 390).
  const wide = useLayout().sizeClass === 'wide'
  const pair = wide ? 'row' : 'column'
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack direction={pair} gap="lg" wrap={wide}>
            <Example caption={`${l.without} — ${l[scheme]}`}>
              <Phone origin={null} />
            </Example>
            <Example caption={`${l.with} — ${l[scheme]}`}>
              <Phone origin={origin} />
            </Example>
            {scheme === 'day' ? (
              <Example caption={`${l.holding} — ${l[scheme]}`}>
                <Phone origin={null} holdOrigin />
              </Example>
            ) : null}
          </Stack>
        </ThemeProvider>
      ))}

      {wide ? (
        <Example caption={`${l.with} — ${l.desktop}`}>
          <Frame>
            <BrandAmbiance size="wide" hero={<PortalRings />}>
              <LeavingSheet host={host} href={href} origin={origin} onOpen={noop} onStay={noop} />
            </BrandAmbiance>
          </Frame>
        </Example>
      ) : null}
    </Stack>
  )
}
