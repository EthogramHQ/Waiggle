// La section « Portail et introuvable » du catalogue (tranche R5a) : les deux décors de marque de la
// page projet, posés sur le miel vif comme dans l'appli.
// - Le portail de la page de sortie (PortalRings) : les anneaux aspirés vers le centre, la lumière
//   qui tourne, la page quittée floutée qui part au fond ; de jour, de nuit, et dans son allure
//   calme (« Réduire les animations » : immobile, apparu en fondu).
// - L'introuvable d'un projet : les alvéoles de verre (Honeycomb) avec la mascotte à la loupe, et
//   l'état sans image à lui (StateMessage `picture={null}`), de jour et de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés d'exemple (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes de l'état sont ceux de l'appli.
import { radii } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { BrandAmbiance } from '../ui/BrandAmbiance'
import { Button } from '../ui/Button'
import { Honeycomb, PortalRings } from '../ui/Illustrations'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Portail et introuvable',
  intro:
    'Deux décors de marque de la page projet, sur le miel vif. Le portail s’ouvre quand on quitte Waiggle pour une démo : la page quittée floutée part au fond, les anneaux sont aspirés vers le centre, la lumière tourne. Avec « Réduire les animations », il apparaît en fondu et rien ne bouge. L’introuvable d’un projet montre des alvéoles de verre, la mascotte à la loupe au centre.',
  portal: 'Portail',
  portalCalm: 'Portail, « Réduire les animations » : immobile',
  notFound: 'Projet introuvable',
  desktop: 'Ordinateur : le décor sur le miel, à gauche de la carte (`hero`)',
  day: 'jour',
  night: 'nuit',
  leaving: 'Tu quittes Waiggle pour',
  host: 'carnet-cafes.vercel.app',
  open: 'Ouvrir le site',
  stay: 'Rester sur Waiggle',
}

const en: typeof fr = {
  title: 'Portal and not found',
  intro:
    'Two brand decors of the project page, on bright honey. The portal opens when you leave Waiggle for a demo: the blurred page you leave falls back, the rings are drawn to the centre, the light turns. With “Reduce motion”, it fades in and nothing moves. A project not found shows glass honeycomb cells, the mascot with its magnifier in the middle.',
  portal: 'Portal',
  portalCalm: 'Portal, “Reduce motion”: still',
  notFound: 'Project not found',
  desktop: 'Computer: the decor on the honey, left of the card (`hero`)',
  day: 'day',
  night: 'night',
  leaving: 'You are leaving Waiggle for',
  host: 'carnet-cafes.vercel.app',
  open: 'Open the site',
  stay: 'Stay on Waiggle',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

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

/** Un exemple légendé (« Portail — nuit »). */
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

/** Ce que la page de sortie pose sur la feuille, en bref : de quoi juger le décor en situation. */
function LeavingSheet({ l }: { l: Labels }) {
  return (
    <>
      <Stack gap="xs">
        <Text variant="callout" weight={600} tone="secondary">
          {l.leaving}
        </Text>
        <Text variant="title2" breakAnywhere>
          {l.host}
        </Text>
      </Stack>
      <Stack gap="md">
        <Button label={l.open} onPress={noop} />
        <Button label={l.stay} variant="secondary" onPress={noop} />
      </Stack>
    </>
  )
}

/** L'état introuvable d'un projet, avec les textes de l'appli. */
function NotFoundSheet() {
  const { t } = useTranslation()
  return (
    <StateMessage
      kind="notFound"
      title={t(($) => $.project.page.notFoundTitle)}
      message={t(($) => $.project.page.notFound)}
      picture={null}
      actions={[{ label: t(($) => $.project.page.notFoundAction), onPress: noop }]}
    />
  )
}

export function NotFoundPortalCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
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

      <Stack direction={pair} gap="lg" wrap={wide}>
        {schemes.map((scheme) => (
          // Un thème imposé autour de l'exemple : le jour et la nuit côte à côte.
          <ThemeProvider key={scheme} appearance={scheme}>
            <Example caption={`${l.portal} — ${l[scheme]}`}>
              <Frame width={390}>
                <BrandAmbiance size="compact" scene={<PortalRings />}>
                  <LeavingSheet l={l} />
                </BrandAmbiance>
              </Frame>
            </Example>
          </ThemeProvider>
        ))}
        <Example caption={l.portalCalm}>
          <Frame width={390}>
            <BrandAmbiance size="compact" scene={<PortalRings calm />}>
              <LeavingSheet l={l} />
            </BrandAmbiance>
          </Frame>
        </Example>
      </Stack>

      <Stack direction={pair} gap="lg" wrap={wide}>
        {schemes.map((scheme) => (
          <ThemeProvider key={scheme} appearance={scheme}>
            <Example caption={`${l.notFound} — ${l[scheme]}`}>
              <Frame width={390}>
                <BrandAmbiance size="compact" scene={<Honeycomb />}>
                  <NotFoundSheet />
                </BrandAmbiance>
              </Frame>
            </Example>
          </ThemeProvider>
        ))}
      </Stack>

      {wide ? (
        <Stack gap="lg">
          <Example caption={`${l.portal} — ${l.desktop}`}>
            <Frame>
              <BrandAmbiance size="wide" hero={<PortalRings />}>
                <LeavingSheet l={l} />
              </BrandAmbiance>
            </Frame>
          </Example>
          <Example caption={`${l.notFound} — ${l.desktop}`}>
            <Frame>
              <BrandAmbiance size="wide" hero={<Honeycomb />}>
                <NotFoundSheet />
              </BrandAmbiance>
            </Frame>
          </Example>
        </Stack>
      ) : null}
    </Stack>
  )
}
