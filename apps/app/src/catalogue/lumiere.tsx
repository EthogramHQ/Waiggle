// La section « Lumière vivante » du catalogue (tranche R1) : la lumière d'ambiance et ses trois
// sortes de source (le miel, le résumé flou d'une photo, trois couleurs), le fondu de l'une à
// l'autre, et l'impulsion. Sur ordinateur avec WebGL, c'est le dessin de la carte graphique ; les
// captures, rendues sans carte graphique, montrent la version allégée. Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y travaillent en même
// temps. Ses libellés (un outil de développement, absent de l'appli publiée) sont écrits ici, en
// français et en anglais.
import { radii } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientLight } from '../ui/AmbientLight'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { AmbientProvider, type AmbientSource, sourcePalette, useAmbient } from '../ui/theme/ambient'

const fr = {
  title: 'Lumière vivante',
  intro:
    'Sur ordinateur, la lumière est dessinée par la carte graphique (WebGL) : une matière qui coule, des reflets de miel, une lueur qui suit la souris. Sur téléphone, sans WebGL ou avec « Réduire les animations », c’est la version allégée ; les captures, faites sans carte graphique, la montrent aussi.',
  live: 'Une lumière, trois sources : le fondu dure 900 ms',
  source: 'Source de la lumière',
  honey: 'Miel',
  photo: 'Photo',
  palette: 'Trois couleurs',
  pulse: 'Impulsion',
  pulseHint: 'Dix impulsions en moins de 350 ms n’en font qu’une.',
  sources: 'Les trois sources côte à côte',
}

const en: typeof fr = {
  title: 'Living light',
  intro:
    'On a computer, the light is drawn by the graphics card (WebGL): a flowing matter, honey glints, a glow that follows the mouse. On a phone, without WebGL or with “Reduce motion”, it is the light version; the screenshots, taken without a graphics card, show it too.',
  live: 'One light, three sources: the fade lasts 900 ms',
  source: 'Light source',
  honey: 'Honey',
  photo: 'Photo',
  palette: 'Three colours',
  pulse: 'Pulse',
  pulseHint: 'Ten pulses within 350 ms make only one.',
  sources: 'The three sources side by side',
}

type Choice = 'honey' | 'photo' | 'palette'

// Les trois sources de démonstration : rien (le miel), le résumé flou d'une photo de café, et
// trois couleurs données telles quelles (celles qu'un écran choisirait). Aucune couleur n'est
// écrite à la main hors de @ruche/brand (design-rules.test.ts) : les trois couleurs sont celles
// que la lumière tire d'une autre photo, un papillon.
const sources: Record<Choice, AmbientSource> = {
  honey: null,
  photo: { thumbhash: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' }, // gitleaks:allow
  palette: { palette: sourcePalette({ thumbhash: 'GdkFJYTHYFSbVnaPWUZndpajf7QG' }) }, // gitleaks:allow
}

/** Un cadre où la lumière est posée, comme derrière un écran. */
function Frame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <Surface padding="none" radius="tile">
      <View style={{ minHeight: height, overflow: 'hidden', borderRadius: radii.tile }}>
        {children}
      </View>
    </Surface>
  )
}

/** Le choix de la source et l'impulsion : ils parlent à la lumière du cadre par useAmbient(). */
function Controls({ l }: { l: typeof fr }) {
  const { setSource, pulse } = useAmbient()
  const [choice, setChoice] = useState<Choice>('honey')
  return (
    <Stack padding="lg" gap="md">
      <Segmented<Choice>
        label={l.source}
        options={[
          { value: 'honey', label: l.honey },
          { value: 'photo', label: l.photo },
          { value: 'palette', label: l.palette },
        ]}
        value={choice}
        onChange={(next) => {
          setChoice(next)
          setSource(sources[next])
        }}
      />
      <Stack direction="row" gap="md" wrap align="center">
        <Button label={l.pulse} icon="sparkle" variant="glass" onPress={() => pulse(1)} />
        <Text variant="caption" tone="secondary">
          {l.pulseHint}
        </Text>
      </Stack>
    </Stack>
  )
}

export function LightCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Text variant="headline" tone="secondary">
        {l.live}
      </Text>
      {/* Un fournisseur à lui : la lumière du cadre a sa source et ses impulsions, distinctes de
          celles de la page. */}
      <AmbientProvider>
        <Frame height={260}>
          <AmbientLight />
          <Controls l={l} />
        </Frame>
      </AmbientProvider>
      <Text variant="headline" tone="secondary">
        {l.sources}
      </Text>
      <Stack direction="row" gap="md" wrap>
        {(Object.keys(sources) as Choice[]).map((choice) => (
          <Stack key={choice} gap="xs" grow>
            <Frame height={140}>
              <AmbientLight source={sources[choice]} />
            </Frame>
            <Text variant="micro" tone="muted">
              {l[choice]}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
