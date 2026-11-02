// La section « Les pages apparaissent en fondu » du catalogue (tranche RF) : le fondu des pages
// (ui/ScreenFade.tsx) autour de deux pages factices, chacune dans une route de démonstration
// (`ScreenRouteScope`, ui/screenFocus.ts) qui se comporte comme une page de la pile. Choisir la page
// affichée la fait fondre à l'arrivée, comme un retour ; « Ouvrir une page neuve » remonte la page B
// dans une route neuve, comme une page qu'on ouvre. Une troisième page, `fade={false}`, arrive sans
// fondu (la page d'un projet ouverte depuis une carte). Sur iOS et Android, rien ne fond : la pile
// glisse. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne ; ses libellés (un outil
// de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import { radii } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { ScreenFade } from '../ui/ScreenFade'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { ScreenRouteScope, useScreenShownCount } from '../ui/screenFocus'
import { Text } from '../ui/Text'

// L'espace insécable avant le deux-points (typographie française), écrite par son numéro : un
// caractère invisible tapé tel quel se perdrait à la relecture.
const nbsp = String.fromCodePoint(0xa0)

const fr = {
  title: 'Les pages apparaissent en fondu',
  intro: `Sur le web, le contenu d’une page ouverte dans l’appli apparaît en fondu (180${nbsp}ms), à l’aller comme au retour. Jamais la première page de la visite, ni un écran remonté pendant la visite (la fin d’un chargement). Le fondu suit la route${nbsp}: chaque page compte ses arrivées. Sur téléphone, rien${nbsp}: la pile glisse.`,
  shown: 'Page affichée',
  pageA: 'Page A',
  pageB: 'Page B',
  pageC: 'Sans fondu',
  openNew: 'Ouvrir une page neuve',
  arrivals: (count: number) => `Arrivées de cette route${nbsp}: ${count}`,
  noFade: `fade={false}${nbsp}: la page d’un projet ouverte depuis une carte, qui a son propre passage.`,
  tap: 'Toucher pendant le fondu',
  tapped: (count: number) => `Touché ${count} fois`,
}

const en: typeof fr = {
  title: 'Pages fade in',
  intro:
    'On the web, the content of a page opened in the app fades in (180 ms), going and coming back. Never the first page of the visit, nor a screen mounted again during the visit (the end of a load). The fade follows the route: each page counts its arrivals. On phones, nothing: the stack slides.',
  shown: 'Page shown',
  pageA: 'Page A',
  pageB: 'Page B',
  pageC: 'No fade',
  openNew: 'Open a new page',
  arrivals: (count: number) => `Arrivals of this route: ${count}`,
  noFade: 'fade={false}: a project page opened from a card, which has its own passage.',
  tap: 'Tap during the fade',
  tapped: (count: number) => `Tapped ${count} times`,
}

type Labels = typeof fr
type PageKey = 'a' | 'b' | 'c'

/** Le nombre d'arrivées de la route, lu comme le lit le fondu. */
function Arrivals({ l }: { l: Labels }) {
  const count = useScreenShownCount()
  return (
    <Text variant="caption" tone="secondary">
      {l.arrivals(count)}
    </Text>
  )
}

/**
 * Une page factice dans sa route de démonstration : cachée, elle est en `display: none`, comme une
 * page quittée de la pile sur le web, et sa route n'est plus affichée.
 */
function FakePage({
  shown,
  fade,
  children,
}: {
  shown: boolean
  fade?: boolean
  children: ReactNode
}) {
  return (
    <View style={{ display: shown ? 'flex' : 'none' }}>
      <ScreenRouteScope focused={shown}>
        <ScreenFade fade={fade}>{children}</ScreenFade>
      </ScreenRouteScope>
    </View>
  )
}

function PageBody({ name, note, l }: { name: string; note?: string; l: Labels }) {
  const [taps, setTaps] = useState(0)
  return (
    <Stack padding="lg" gap="md">
      <Text variant="headline">{name}</Text>
      <Arrivals l={l} />
      {note ? <Text tone="secondary">{note}</Text> : null}
      <Stack direction="row" gap="md" wrap align="center">
        <Button label={l.tap} variant="glass" onPress={() => setTaps(taps + 1)} />
        <Text variant="caption" tone="secondary">
          {l.tapped(taps)}
        </Text>
      </Stack>
    </Stack>
  )
}

export function ScreenFadeCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [shown, setShown] = useState<PageKey>('a')
  // Le numéro de la page B : le changer la remonte dans une route neuve (0 arrivée).
  const [bRoute, setBRoute] = useState(1)
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Segmented<PageKey>
        label={l.shown}
        options={[
          { value: 'a', label: l.pageA },
          { value: 'b', label: l.pageB },
          { value: 'c', label: l.pageC },
        ]}
        value={shown}
        onChange={setShown}
      />
      <Stack direction="row" gap="md" wrap>
        <Button
          label={l.openNew}
          variant="glass"
          onPress={() => {
            setBRoute(bRoute + 1)
            setShown('b')
          }}
        />
      </Stack>
      <Surface padding="none" radius="tile">
        <View style={{ minHeight: 220, overflow: 'hidden', borderRadius: radii.tile }}>
          <FakePage shown={shown === 'a'}>
            <PageBody name={l.pageA} l={l} />
          </FakePage>
          <FakePage key={bRoute} shown={shown === 'b'}>
            <PageBody name={`${l.pageB} · ${bRoute}`} l={l} />
          </FakePage>
          <FakePage shown={shown === 'c'} fade={false}>
            <PageBody name={l.pageC} note={l.noFade} l={l} />
          </FakePage>
        </View>
      </Surface>
    </Stack>
  )
}
