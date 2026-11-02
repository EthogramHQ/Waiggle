// La section « Une lumière pour toutes les pages » du catalogue (tranche RF) : l'hôte de la lumière
// (ui/AmbientHost.tsx) avec deux écrans factices, qui s'inscrivent comme le font les vrais écrans
// (ScreenAmbient, ui/theme/ambient.tsx). On choisit l'écran affiché : la lumière commune glisse vers
// sa source ; l'autre écran, caché comme une page quittée de la pile, ne la touche plus. L'écran B
// peut renoncer à la lumière (comme une page du miel) : elle s'efface. Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne ; ses libellés (un outil de développement, absent
// de l'appli publiée) sont écrits ici, en français et en anglais.
import { radii } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientHost } from '../ui/AmbientHost'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Switch } from '../ui/Switch'
import { Text } from '../ui/Text'
import {
  type AmbientSource,
  ScreenAmbient,
  sameSource,
  sourcePalette,
  useAmbient,
  useAmbientSource,
} from '../ui/theme/ambient'

const fr = {
  title: 'Une lumière pour toutes les pages',
  intro:
    'Sur le web, une seule lumière est posée derrière toutes les pages. Chaque écran s’y inscrit avec sa source. La lumière dessine celle de l’écran devenu affiché en dernier, et glisse vers elle au lieu de repartir de zéro. Un écran caché (une page quittée, gardée dans la pile) ne la touche plus. Sur un écran du miel, ou sans lumière, elle s’efface.',
  shown: 'Écran affiché',
  screenA: 'Écran A',
  screenB: 'Écran B',
  bWantsLight: 'L’écran B veut une lumière',
  bWantsLightHint: 'Éteint, c’est comme une page du miel (connexion, inscription).',
  // L'espace insécable avant le deux-points (typographie française), écrite par son numéro : un
  // caractère invisible tapé tel quel se perdrait à la relecture.
  drawn: `Lumière dessinée${String.fromCodePoint(0xa0)}:`,
  none: 'aucune (elle s’efface)',
  changeSource: 'Changer ma source',
  pulse: 'Impulsion',
  sourceA: 'trois couleurs',
  sourceB: 'photo',
  honey: 'miel',
}

const en: typeof fr = {
  title: 'One light for every page',
  intro:
    'On the web, a single light sits behind every page. Each screen registers its source; the light draws the one of the screen shown last, and glides to it instead of starting over. A hidden screen (a page left behind, kept in the stack) no longer touches it. On a honey screen, or without light, it fades out.',
  shown: 'Shown screen',
  screenA: 'Screen A',
  screenB: 'Screen B',
  bWantsLight: 'Screen B wants a light',
  bWantsLightHint: 'Off: like a honey page (sign-in, sign-up).',
  drawn: 'Light drawn:',
  none: 'none (it fades out)',
  changeSource: 'Change my source',
  pulse: 'Pulse',
  sourceA: 'three colours',
  sourceB: 'photo',
  honey: 'honey',
}

type Labels = typeof fr
type ScreenKey = 'a' | 'b'

// Les sources de démonstration, celles de la section « Lumière vivante » : trois couleurs tirées
// d'une photo de papillon, et le résumé flou d'une photo de café. Aucune couleur écrite à la main
// hors de @ruche/brand (design-rules.test.ts).
const butterfly: AmbientSource = {
  palette: sourcePalette({ thumbhash: 'GdkFJYTHYFSbVnaPWUZndpajf7QG' }), // gitleaks:allow
}
const coffee: AmbientSource = { thumbhash: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' } // gitleaks:allow

/** Le nom d'une source, pour le relevé de ce qui est dessiné. */
const sourceName = (source: AmbientSource, l: Labels) => {
  if (source === null) return l.honey
  if (sameSource(source, butterfly)) return l.sourceA
  if (sameSource(source, coffee)) return l.sourceB
  return '?'
}

/** Ce que la lumière commune dessine, lu comme elle le lit (useAmbientSource). */
function DrawnReadout({ l }: { l: Labels }) {
  const { source, lit } = useAmbientSource()
  return (
    <Text variant="caption" tone="secondary">
      {`${l.drawn} ${lit ? sourceName(source, l) : l.none}`}
    </Text>
  )
}

/**
 * Un écran factice : il s'inscrit auprès de l'hôte comme un vrai écran, et ses boutons parlent à la
 * lumière par useAmbient(), avec les gestes liés à son inscription. Caché, il est en
 * `display: none`, comme une page quittée de la pile sur le web.
 */
function FakeScreen({
  name,
  shown,
  light,
  initialSource,
  other,
  l,
}: {
  name: string
  shown: boolean
  light: boolean
  initialSource: AmbientSource
  /** La source vers laquelle « Changer ma source » bascule, puis revient. */
  other: AmbientSource
  l: Labels
}) {
  return (
    <View style={{ display: shown ? 'flex' : 'none' }}>
      <ScreenAmbient light={light} initialSource={initialSource} focused={shown}>
        <FakeScreenBody name={name} initialSource={initialSource} other={other} l={l} />
      </ScreenAmbient>
    </View>
  )
}

function FakeScreenBody({
  name,
  initialSource,
  other,
  l,
}: {
  name: string
  initialSource: AmbientSource
  other: AmbientSource
  l: Labels
}) {
  const { setSource, pulse } = useAmbient()
  const [switched, setSwitched] = useState(false)
  return (
    <Stack padding="lg" gap="md">
      <Text variant="headline">{name}</Text>
      <Stack direction="row" gap="md" wrap align="center">
        <Button
          label={l.changeSource}
          variant="glass"
          onPress={() => {
            setSource(switched ? initialSource : other)
            setSwitched(!switched)
          }}
        />
        <Button label={l.pulse} icon="sparkle" variant="glass" onPress={() => pulse(1)} />
      </Stack>
    </Stack>
  )
}

/** Un cadre où l'hôte est posé, comme derrière une appli. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <Surface padding="none" radius="tile">
      <View style={{ height: 300, overflow: 'hidden', borderRadius: radii.tile }}>{children}</View>
    </Surface>
  )
}

export function AmbientHostCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [shown, setShown] = useState<ScreenKey>('a')
  const [bLight, setBLight] = useState(true)
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Segmented<ScreenKey>
        label={l.shown}
        options={[
          { value: 'a', label: l.screenA },
          { value: 'b', label: l.screenB },
        ]}
        value={shown}
        onChange={setShown}
      />
      <Switch
        label={l.bWantsLight}
        hint={l.bWantsLightHint}
        value={bLight}
        onValueChange={setBLight}
      />
      <Frame>
        <AmbientHost>
          <Stack padding="lg" gap="xs">
            <DrawnReadout l={l} />
          </Stack>
          <FakeScreen
            name={l.screenA}
            shown={shown === 'a'}
            light
            initialSource={butterfly}
            other={coffee}
            l={l}
          />
          <FakeScreen
            name={l.screenB}
            shown={shown === 'b'}
            light={bLight}
            initialSource={coffee}
            other={null}
            l={l}
          />
        </AmbientHost>
      </Frame>
    </Stack>
  )
}
