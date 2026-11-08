// La section « La danse de publication » du catalogue (tranche R6a, planche R6-Danse) : l'abeille
// du logo dessine son huit avec une traînée de miel, puis file vers la nouvelle carte (`PublishDance`).
// - Une scène où la danse se rejoue : vers une carte, sans cible (elle finit sur place), et en
//   mouvement réduit (rien ne vole, la fin part tout de suite). La ligne du dessous compte les
//   `onDone` : un par danse.
// - La danse figée à quatre instants (prop `moment`), pour les captures : une animation ne se
//   regarde pas sur une image prise au hasard.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Les légendes (un outil de développement, absent de l'appli publiée)
// sont écrites ici en français et en anglais ; la danse n'a aucun texte.
import { layout, radii, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { PublishDance } from '../ui/PublishDance'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'
import { useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La danse de publication (R6a)',
  intro:
    'Après « Publier » d’un projet visible des membres, l’abeille dessine un huit par-dessus le fil, puis file vers la nouvelle carte et s’efface (3 s environ). C’est un décor : caché aux lecteurs d’écran, les tapes le traversent. Avec « Réduire les animations », rien ne vole.',
  stage: 'Rejouer la danse',
  toCard: 'Vers la carte',
  noTarget: 'Sans cible (finit sur place)',
  calm: 'Mouvement réduit',
  card: 'La nouvelle carte',
  done: (count: number) => `onDone appelé ${count} fois`,
  frozen: 'Figée (prop moment)',
  moments: [
    { at: 0.3, label: '30 % : la boucle de droite' },
    { at: 0.65, label: '65 % : le huit presque fini' },
    { at: 0.84, label: '84 % : le vol vers la carte' },
    { at: 0.94, label: '94 % : posée, elle s’efface' },
  ],
}

const en: typeof fr = {
  title: 'The publishing dance (R6a)',
  intro:
    'After “Publish” on a project members can see, the bee draws a figure eight over the feed, then darts to the new card and fades (about 3 s). It is decoration: hidden from screen readers, taps go through it. With “Reduce motion”, nothing flies.',
  stage: 'Replay the dance',
  toCard: 'To the card',
  noTarget: 'No target (ends in place)',
  calm: 'Reduced motion',
  card: 'The new card',
  done: (count: number) => `onDone called ${count} time${count === 1 ? '' : 's'}`,
  frozen: 'Frozen (moment prop)',
  moments: [
    { at: 0.3, label: '30%: the right loop' },
    { at: 0.65, label: '65%: the eight almost done' },
    { at: 0.84, label: '84%: flying to the card' },
    { at: 0.94, label: '94%: landed, fading' },
  ],
}

/** La scène : la hauteur d'un haut de fil, et la carte posée dessous, comme sur la planche. */
const STAGE_HEIGHT = 440
const CARD_TOP = 300
const CARD = { width: 180, height: 96 }
/** Où l'abeille se pose : le coin haut gauche de la carte, là où paraît sa catégorie. */
const TARGET = { x: space.lg + space.xxxl, y: CARD_TOP + space.md }
/** La largeur de départ d'une scène figée : le huit (246 points) et un peu d'air. */
const FROZEN_BASIS = 300

/** La scène de la danse : un fond de page et la nouvelle carte, la danse par-dessus. */
function Stage({ children }: { children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height: STAGE_HEIGHT,
        width: '100%',
        maxWidth: layout.formWidth,
        backgroundColor: colors.background,
        borderRadius: radii.tile,
        overflow: 'hidden',
      }}
    >
      <NewCard />
      {children}
    </View>
  )
}

/** La nouvelle carte, en tête du fil : une simple tuile miel pâle. */
function NewCard() {
  const { colors } = useTheme()
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <View
      style={{
        position: 'absolute',
        left: space.lg,
        top: CARD_TOP,
        width: CARD.width,
        height: CARD.height,
        borderRadius: radii.small,
        backgroundColor: colors.honeySoft,
        padding: space.md,
        justifyContent: 'flex-end',
      }}
    >
      <Text variant="callout">{l.card}</Text>
    </View>
  )
}

type Run = { id: number; aimed: boolean; calm: boolean }

/** La danse qui se rejoue : chaque bouton la relance de zéro (une nouvelle clé). */
function ReplayDemo() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [run, setRun] = useState<Run | null>(null)
  const [done, setDone] = useState(0)
  const start = (aimed: boolean, calm: boolean) =>
    setRun((previous) => ({ id: (previous?.id ?? 0) + 1, aimed, calm }))
  return (
    <Stack gap="md">
      <Stack direction="row" gap="sm" wrap>
        <Button label={l.toCard} size="compact" onPress={() => start(true, false)} />
        <Button
          label={l.noTarget}
          size="compact"
          variant="secondary"
          onPress={() => start(false, false)}
        />
        <Button
          label={l.calm}
          size="compact"
          variant="secondary"
          onPress={() => start(true, true)}
        />
      </Stack>
      <Stage>
        {run ? (
          <PublishDance
            key={run.id}
            playing
            target={run.aimed ? TARGET : null}
            // Le mouvement réduit est forcé ici ; les deux autres suivent le réglage de l'appareil.
            calm={run.calm ? true : undefined}
            onDone={() => setDone((count) => count + 1)}
          />
        ) : null}
      </Stage>
      <Text variant="micro" tone="muted">
        {l.done(done)}
      </Text>
    </Stack>
  )
}

export function PublishDanceCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // La danse figée lit la taille de la fenêtre : rien avant l'hydratation (page pré-rendue).
  const hydrated = useHydrated()
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Surface variant="grouped" padding="lg" gap="md">
        <Text variant="headline" tone="secondary">
          {l.stage}
        </Text>
        <ReplayDemo />
      </Surface>
      <Surface variant="grouped" padding="lg" gap="md">
        <Text variant="headline" tone="secondary">
          {l.frozen}
        </Text>
        <Stack direction="row" gap="lg" wrap>
          {l.moments.map((moment) => (
            // Une base réelle : quatre scènes côte à côte sur ordinateur, une par rangée sur
            // téléphone (`flex: 1` les écraserait sur une seule rangée).
            <View
              key={moment.at}
              style={{
                flexGrow: 1,
                flexBasis: FROZEN_BASIS,
                minWidth: 0,
                maxWidth: '100%',
                gap: space.sm,
              }}
            >
              <Stage>
                {hydrated ? (
                  // calm={false} : figée, elle se montre même si l'appareil réduit les animations.
                  <PublishDance
                    playing
                    target={TARGET}
                    calm={false}
                    moment={moment.at}
                    onDone={() => {}}
                  />
                ) : null}
              </Stage>
              <Text variant="micro" tone="muted">
                {moment.label}
              </Text>
            </View>
          ))}
        </Stack>
      </Surface>
    </Stack>
  )
}
