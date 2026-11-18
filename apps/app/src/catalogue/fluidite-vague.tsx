// La section « La vague de miel » du catalogue (R17, scénario « La vague de miel à l'entrée ») : la
// vague qui monte depuis le bouton de connexion, couvre l'écran, puis se retire sur le Fil. Un bouton
// la lance pour de vrai (l'hôte de l'appli, HoneyWaveHost, est monté autour de toutes les pages),
// et un compteur dit combien de fois la page aurait changé (`then`, à mi-vague). Puis quatre images
// figées (`at`), de jour et de nuit : le départ, la montée, l'écran couvert, le retrait. Sous
// « Réduire les animations », pas de vague : un fondu vers le Fil, et `then` tout de suite.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { HoneyWave } from '../ui/HoneyWave'
import { useHoneyWave, type WaveButton } from '../ui/HoneyWaveHost'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useCalmMotion } from '../ui/theme/motion'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La vague de miel',
  intro:
    'À l’entrée dans l’appli (connexion réussie, « Continuer » après la vérification de l’adresse), une vague de miel monte depuis le bouton touché, couvre l’écran, puis se retire sur le Fil. Pendant la vague, rien ne se touche ; la page change à mi-vague, quand l’écran est couvert.',
  play: 'Lancer la vague',
  changed: 'La page aurait changé {{count}} fois (then, à mi-vague)',
  calmOn:
    '« Réduire les animations » est activé : pas de vague, un fondu vers le Fil, et la page change tout de suite.',
  calmOff:
    'Avec « Réduire les animations », pas de vague : un fondu vers le Fil, et la page change tout de suite.',
  frames: 'Images figées (at)',
  start: 'Le départ (0)',
  rising: 'La montée (0,25)',
  covered: 'L’écran couvert (0,5)',
  leaving: 'Le retrait (0,75)',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The honey wave',
  intro:
    'On entering the app (successful sign-in, “Continue” after verifying the address), a honey wave rises from the tapped button, covers the screen, then withdraws over the Feed. Nothing can be tapped during the wave; the page changes halfway, while the screen is covered.',
  play: 'Play the wave',
  changed: 'The page would have changed {{count}} times (then, halfway)',
  calmOn: '“Reduce motion” is on: no wave, a fade to the Feed, and the page changes at once.',
  calmOff: 'With “Reduce motion”, no wave: a fade to the Feed, and the page changes at once.',
  frames: 'Still frames (at)',
  start: 'Start (0)',
  rising: 'Rising (0.25)',
  covered: 'Screen covered (0.5)',
  leaving: 'Withdrawing (0.75)',
  day: 'day',
  night: 'night',
}

// La taille des images figées : un téléphone en réduction, la vague partant du bas du tiers inférieur
// (là où est le bouton « Se connecter »).
const FRAME_WIDTH = 180
const FRAME_HEIGHT = 320
const BUTTON_Y = 240

export function HoneyWaveCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const wave = useHoneyWave()
  const calm = useCalmMotion()
  const button = useRef<WaveButton>(null)
  const [changes, setChanges] = useState(0)
  const frames = [
    { at: 0, caption: l.start },
    { at: 0.25, caption: l.rising },
    { at: 0.5, caption: l.covered },
    { at: 0.75, caption: l.leaving },
  ]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Surface variant="plain" padding="lg" gap="sm">
        {/* La vue mesurée : la vague part du milieu de ce bouton, comme de « Se connecter ». */}
        <View ref={button} collapsable={false} style={{ alignSelf: 'flex-start' }}>
          <Button
            label={l.play}
            onPress={() => {
              // `then` en raccourci : Biome refuse une propriété nommée `then` écrite en clair.
              const then = () => setChanges((count) => count + 1)
              wave.play({ from: button.current, then })
            }}
          />
        </View>
        <Text variant="caption" tone="muted">
          {l.changed.replace('{{count}}', String(changes))}
        </Text>
        <Text variant="caption" tone="muted">
          {calm ? l.calmOn : l.calmOff}
        </Text>
      </Surface>

      <Text variant="headline">{l.frames}</Text>
      {(['day', 'night'] as const).map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="plain" padding="lg" gap="sm">
            <Row gap="md" wrap>
              {frames.map((frame) => (
                <Stack key={frame.at} gap="xs">
                  <Surface variant="grouped" padding="none">
                    <View style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, overflow: 'hidden' }}>
                      <HoneyWave
                        at={frame.at}
                        originY={BUTTON_Y}
                        width={FRAME_WIDTH}
                        height={FRAME_HEIGHT}
                      />
                    </View>
                  </Surface>
                  <Text variant="caption" tone="muted">
                    {`${frame.caption} — ${l[scheme]}`}
                  </Text>
                </Stack>
              ))}
            </Row>
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
