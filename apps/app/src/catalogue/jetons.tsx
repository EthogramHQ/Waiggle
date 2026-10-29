// La rubrique « Jetons » du catalogue (tranche R1) : les valeurs de packages/brand telles qu'on les
// voit (les couleurs avec leurs noms de marque, les lettres, les formes, les ombres, le mouvement),
// puis les composants de Miel 2 posés sur ces jetons : la pile d'avatars, les tuiles, les
// squelettes et les messages (Notice). Le jour et la nuit se voient en changeant l'apparence en haut
// du catalogue. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs
// personnes y travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais.
import {
  borders,
  brandNames,
  type ColorName,
  durations,
  easings,
  fontWeights,
  layout,
  pressScale,
  pressScaleFab,
  radii,
  type SpringName,
  space,
  springs,
  type TextVariant,
  textStyles,
} from '@ruche/brand'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { AvatarStack } from '../ui/AvatarStack'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { SkeletonCard, SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { AddTile, ProjectTile } from '../ui/Tile'
import { spring, useCalmMotion } from '../ui/theme/motion'
import { useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Jetons',
  intro:
    'Les valeurs de packages/brand, telles qu’on les voit. Le code parle par rôle (honey, text) ; la marque, par nom (Miel, Encre). En dessous, les composants de Miel 2 posés sur ces jetons.',
  colors: 'Les couleurs et leurs noms de marque',
  type: 'Les lettres : chaque rôle',
  typeMono:
    'Les rôles mono et code prennent encore la police à chasse fixe du système : Geist Mono arrive avec son paquet.',
  weights: 'Les graisses livrées',
  toolLong: 'Un nom d’outil long rétrécit (toolName)',
  sample: 'Carnet de cafés',
  tool: 'Claude Code',
  toolLongName: 'Stable Diffusion XL Turbo',
  lead: 'Tu photographies ta tasse, il note le café.',
  mono: 'v2.3.1 · 12 testeurs · 4 h',
  code: 'Tu es un barista patient. Décris ce café en trois mots.',
  shapes: 'Les formes : rayons, écarts, hauteurs, traits',
  radii: 'Rayons',
  spaces: 'Écarts',
  heights: 'Hauteurs des contrôles',
  borders: 'Traits',
  shadows: 'Les ombres',
  motion: 'Le mouvement',
  play: 'Jouer les ressorts',
  calm: '« Réduire les animations » est activé : les pastilles sautent sans ressort.',
  durations: 'Durées (ms)',
  easings: 'Courbes',
  press: (normal: number, fab: number) => `Enfoncement : ${normal} (bouton), ${fab} (bouton « + »)`,
  stacks: 'Piles d’avatars (des membres, jamais qui a réagi ni qui suit)',
  members: (n: number) => `${n} membres`,
  tiles: 'Tuiles : miel, crème, encre ; avec photo ; la tuile « + Ajouter »',
  tileTitles: ['Carnet de cafés', 'Le tri des photos', 'Météo du jardin'],
  tileLong: 'Un carnet de dégustation de cafés de spécialité, avec la mouture',
  authors: ['Léa Moreau', 'Max Durand', 'Inès Haddad'],
  add: 'Ajouter un projet',
  skeletons: 'Squelettes : une carte, puis une liste de deux',
  notices: 'Messages (Notice)',
  error: 'Mot de passe incorrect.',
  expired: 'Ta session a expiré. Reconnecte-toi pour continuer.',
  signIn: 'Me reconnecter',
  info: 'Ce projet est privé : personne d’autre que toi ne le voit.',
  success: 'Note publiée.',
}

const en: typeof fr = {
  title: 'Tokens',
  intro:
    'The values of packages/brand, as they look. The code speaks by role (honey, text); the brand, by name (Honey, Ink). Below, the Miel 2 components built on these tokens.',
  colors: 'Colours and their brand names',
  type: 'Type: every role',
  typeMono:
    'The mono and code roles still use the system monospace font: Geist Mono comes with its package.',
  weights: 'The weights we ship',
  toolLong: 'A long tool name shrinks (toolName)',
  sample: 'Coffee notebook',
  tool: 'Claude Code',
  toolLongName: 'Stable Diffusion XL Turbo',
  lead: 'Snap your cup: it rates the coffee.',
  mono: 'v2.3.1 · 12 testers · 4 h',
  code: 'You are a patient barista. Describe this coffee in three words.',
  shapes: 'Shapes: radii, spacing, heights, strokes',
  radii: 'Radii',
  spaces: 'Spacing',
  heights: 'Control heights',
  borders: 'Strokes',
  shadows: 'Shadows',
  motion: 'Motion',
  play: 'Play the springs',
  calm: '“Reduce motion” is on: the dots jump without a spring.',
  durations: 'Durations (ms)',
  easings: 'Curves',
  press: (normal: number, fab: number) => `Press: ${normal} (button), ${fab} (“+” button)`,
  stacks: 'Avatar stacks (members, never who reacted or who follows)',
  members: (n: number) => `${n} members`,
  tiles: 'Tiles: honey, cream, ink; with a photo; the “+ Add” tile',
  tileTitles: ['Coffee notebook', 'Photo sorter', 'Garden weather'],
  tileLong: 'A tasting notebook for specialty coffees, with the grind',
  authors: ['Léa Moreau', 'Max Durand', 'Inès Haddad'],
  add: 'Add a project',
  skeletons: 'Skeletons: one card, then a list of two',
  notices: 'Messages (Notice)',
  error: 'Wrong password.',
  expired: 'Your session has expired. Sign in again to continue.',
  signIn: 'Sign in again',
  info: 'This project is private: only you can see it.',
  success: 'Note posted.',
}

type Labels = typeof fr

/** Le résumé flou d'une photo de café (ThumbHash), pour une tuile « avec photo » sans réseau. */
const cafe = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow

/** Les rôles qui portent un nom de marque, dans l'ordre du canevas de marque. */
const brandRoles: readonly ColorName[] = [
  'honey',
  'amber',
  'honeyLight',
  'honeySoft',
  'text',
  'background',
]

/** Des membres pour les piles : des noms seuls, leurs initiales s'affichent. */
const people = [
  'Léa Moreau',
  'Max Durand',
  'Inès Haddad',
  'Sam Petit',
  'Noé Blanc',
  'Zoé Martin',
  'Malik Benali',
  'Jeanne Roy',
  'Hugo Lefèvre',
  'Lina Garcia',
  'Tom Bernard',
  'Emma Petit',
  'Paul Girard',
  'Nina Faure',
].map((name) => ({ name, source: null }))

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <Text variant="headline" tone="secondary">
        {title}
      </Text>
      {children}
    </Surface>
  )
}

/** Une petite étiquette technique (nom de jeton, valeur), en mono. */
function Mono({ text }: { text: string }) {
  return (
    <Text variant="mono" tone="muted" breakAnywhere>
      {text}
    </Text>
  )
}

function BrandColors() {
  const { colors, scheme } = useTheme()
  return (
    <Stack direction="row" gap="md" wrap>
      {brandRoles.map((role) => (
        <Stack key={role} gap="xs">
          <View
            style={{
              width: 120,
              height: 72,
              borderRadius: radii.small,
              backgroundColor: colors[role],
              borderWidth: borders.hairline,
              borderColor: colors.line,
            }}
          />
          <Text weight={700}>{brandNames[scheme][role] ?? brandNames.day[role] ?? role}</Text>
          <Mono text={role} />
          <Mono text={colors[role]} />
        </Stack>
      ))}
    </Stack>
  )
}

function TypeRoles({ l }: { l: Labels }) {
  const variants = Object.keys(textStyles) as TextVariant[]
  // L'exemple de chaque rôle : le nom d'un outil pour les noms géants, du code pour le mono.
  const sampleOf = (variant: TextVariant): string => {
    if (variant === 'toolName' || variant === 'toolNameWide') return l.tool
    if (variant === 'mono') return l.mono
    if (variant === 'code') return l.code
    if (variant === 'lead') return l.lead
    return l.sample
  }
  return (
    <Stack gap="lg">
      <Text variant="caption" tone="muted">
        {l.typeMono}
      </Text>
      {variants.map((variant) => {
        const style = textStyles[variant]
        return (
          <Stack key={variant} gap="xxs">
            <Mono
              text={`${variant} · ${style.family} ${style.weight} · ${style.size}/${style.lineHeight} · ${style.tracking}`}
            />
            <Text variant={variant}>{sampleOf(variant)}</Text>
          </Stack>
        )
      })}
      <Stack gap="xxs">
        <Mono text={l.toolLong} />
        <Text variant="toolName">{l.toolLongName}</Text>
      </Stack>
      <Text variant="headline" tone="secondary">
        {l.weights}
      </Text>
      <Stack direction="row" gap="lg" wrap>
        {fontWeights.text.map((weight) => (
          <Text key={`text-${weight}`} weight={weight}>
            {`Funnel Sans ${weight}`}
          </Text>
        ))}
      </Stack>
      <Stack direction="row" gap="lg" wrap>
        {fontWeights.display.map((weight) => (
          <Text key={`display-${weight}`} variant="heading" weight={weight}>
            {`Funnel Display ${weight}`}
          </Text>
        ))}
        {fontWeights.mono.map((weight) => (
          <Text key={`mono-${weight}`} variant="mono" weight={weight}>
            {`Geist Mono ${weight}`}
          </Text>
        ))}
      </Stack>
    </Stack>
  )
}

function Shapes({ l }: { l: Labels }) {
  const { colors } = useTheme()
  return (
    <Stack gap="lg">
      <Text variant="callout" weight={700}>
        {l.radii}
      </Text>
      <Stack direction="row" gap="md" wrap>
        {(Object.keys(radii) as (keyof typeof radii)[]).map((name) => (
          <Stack key={name} gap="xs" align="center">
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: radii[name],
                backgroundColor: colors.honeySoft,
                borderWidth: borders.strong,
                borderColor: colors.honey,
              }}
            />
            <Mono text={`${name} ${radii[name]}`} />
          </Stack>
        ))}
      </Stack>
      <Text variant="callout" weight={700}>
        {l.spaces}
      </Text>
      <Stack gap="xs">
        {(Object.keys(space) as (keyof typeof space)[]).map((name) => (
          <Stack key={name} direction="row" gap="sm" align="center">
            <View style={{ width: 72 }}>
              <Mono text={`${name} ${space[name]}`} />
            </View>
            <View
              style={{
                width: space[name],
                height: space.md,
                borderRadius: radii.pill,
                backgroundColor: colors.honey,
              }}
            />
          </Stack>
        ))}
      </Stack>
      <Text variant="callout" weight={700}>
        {l.heights}
      </Text>
      <Stack direction="row" gap="md" wrap align="end">
        {(Object.keys(layout.controlHeight) as (keyof typeof layout.controlHeight)[]).map(
          (name) => (
            <Stack key={name} gap="xs" align="center">
              <View
                style={{
                  width: 96,
                  height: layout.controlHeight[name],
                  borderRadius: radii.pill,
                  backgroundColor: colors.honey,
                }}
              />
              <Mono text={`${name} ${layout.controlHeight[name]}`} />
            </Stack>
          ),
        )}
        <Stack gap="xs" align="center">
          <View
            style={{
              width: layout.fab,
              height: layout.fab,
              borderRadius: radii.pill,
              backgroundColor: colors.honey,
            }}
          />
          <Mono text={`fab ${layout.fab}`} />
        </Stack>
      </Stack>
      <Text variant="callout" weight={700}>
        {l.borders}
      </Text>
      <Stack direction="row" gap="lg" wrap>
        {(Object.keys(borders) as (keyof typeof borders)[]).map((name) => (
          <Stack key={name} gap="xs">
            <View style={{ width: 96, height: borders[name], backgroundColor: colors.text }} />
            <Mono text={`${name} ${borders[name]}`} />
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}

function Shadows() {
  const { colors, shadows } = useTheme()
  return (
    <Stack direction="row" gap="xl" wrap>
      {(Object.keys(shadows) as (keyof typeof shadows)[]).map((name) => (
        <Stack key={name} gap="sm" align="center">
          <View
            style={{
              width: 120,
              height: 72,
              borderRadius: radii.small,
              backgroundColor: colors.surface,
              boxShadow: shadows[name],
            }}
          />
          <Mono text={name} />
        </Stack>
      ))}
    </Stack>
  )
}

/** La course d'une pastille, en points : assez courte pour tenir sur un téléphone de 320. */
const TRACK = 150
const DOT = 24

/** Une pastille qui va d'un bout à l'autre de sa course avec ce ressort, à chaque `round`. */
function SpringDot({ name, round, calm }: { name: SpringName; round: number; calm: boolean }) {
  const { colors } = useTheme()
  const x = useSharedValue(0)
  useEffect(() => {
    if (round === 0) return
    const target = round % 2 === 1 ? TRACK : 0
    x.value = calm ? target : spring(target, name)
  }, [round, calm, name, x])
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const spec = springs[name]
  return (
    <Stack gap="xxs">
      <Mono text={`${name} ${spec.stiffness}/${spec.damping}`} />
      <View
        style={{
          width: TRACK + DOT,
          height: DOT,
          borderRadius: radii.pill,
          backgroundColor: colors.surface,
        }}
      >
        <Animated.View
          style={[
            { width: DOT, height: DOT, borderRadius: radii.pill, backgroundColor: colors.honey },
            moved,
          ]}
        />
      </View>
    </Stack>
  )
}

function Motion({ l }: { l: Labels }) {
  const [round, setRound] = useState(0)
  const calm = useCalmMotion()
  return (
    <Stack gap="lg">
      <Button label={l.play} variant="secondary" size="small" onPress={() => setRound(round + 1)} />
      {calm ? <Text tone="muted">{l.calm}</Text> : null}
      <Stack direction="row" gap="xl" wrap>
        {(Object.keys(springs) as SpringName[]).map((name) => (
          <SpringDot key={name} name={name} round={round} calm={calm} />
        ))}
      </Stack>
      <Text variant="callout" weight={700}>
        {l.durations}
      </Text>
      <Stack direction="row" gap="md" wrap>
        {(Object.keys(durations) as (keyof typeof durations)[]).map((name) => (
          <Mono key={name} text={`${name} ${durations[name]}`} />
        ))}
      </Stack>
      <Text variant="callout" weight={700}>
        {l.easings}
      </Text>
      <Stack direction="row" gap="md" wrap>
        {(Object.keys(easings) as (keyof typeof easings)[]).map((name) => (
          <Mono key={name} text={`${name} (${easings[name].join(', ')})`} />
        ))}
      </Stack>
      <Mono text={l.press(pressScale, pressScaleFab)} />
    </Stack>
  )
}

function Stacks({ l }: { l: Labels }) {
  return (
    <Stack direction="row" gap="xl" wrap align="center">
      {[1, 3, 5, people.length].map((count) => (
        <Stack key={count} gap="xs">
          <AvatarStack members={people.slice(0, count)} label={l.members(count)} />
          <Mono text={l.members(count)} />
        </Stack>
      ))}
    </Stack>
  )
}

function Tiles({ l }: { l: Labels }) {
  const noop = () => {}
  const [honey, cream, ink] = l.tileTitles
  const [lea, max, ines] = l.authors
  return (
    <Stack direction="row" gap="md" wrap>
      <ProjectTile title={honey ?? ''} author={lea ?? ''} onPress={noop} />
      <ProjectTile title={cream ?? ''} author={max ?? ''} variant="cream" onPress={noop} />
      <ProjectTile title={ink ?? ''} author={ines ?? ''} variant="ink" onPress={noop} />
      <ProjectTile
        title={honey ?? ''}
        author={lea ?? ''}
        image={{ source: null, thumbhash: cafe, label: honey ?? '' }}
        onPress={noop}
      />
      <ProjectTile
        title={l.tileLong}
        author={max ?? ''}
        variant="cream"
        image={{ source: null, thumbhash: cafe, label: l.tileLong }}
        onPress={noop}
      />
      <ProjectTile title={l.tileLong} author={ines ?? ''} variant="ink" onPress={noop} />
      <AddTile label={l.add} onPress={noop} />
    </Stack>
  )
}

function Skeletons() {
  return (
    <Stack direction="row" gap="xl" wrap>
      <View style={{ width: 300, maxWidth: '100%' }}>
        <SkeletonCard />
      </View>
      <View style={{ width: 300, maxWidth: '100%' }}>
        <SkeletonList count={2} />
      </View>
    </Stack>
  )
}

function Notices({ l }: { l: Labels }) {
  return (
    <Stack gap="md">
      <Notice message={l.error} />
      <Notice message={l.expired} action={{ label: l.signIn, onPress: () => {} }} />
      <Notice tone="info" polite message={l.info} />
      <Notice tone="success" polite message={l.success} />
    </Stack>
  )
}

export function TokensCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Block title={l.colors}>
        <BrandColors />
      </Block>
      <Block title={l.type}>
        <TypeRoles l={l} />
      </Block>
      <Block title={l.shapes}>
        <Shapes l={l} />
      </Block>
      <Block title={l.shadows}>
        <Shadows />
      </Block>
      <Block title={l.motion}>
        <Motion l={l} />
      </Block>
      <Block title={l.stacks}>
        <Stacks l={l} />
      </Block>
      <Block title={l.tiles}>
        <Tiles l={l} />
      </Block>
      <Block title={l.skeletons}>
        <Skeletons />
      </Block>
      <Block title={l.notices}>
        <Notices l={l} />
      </Block>
    </Stack>
  )
}
