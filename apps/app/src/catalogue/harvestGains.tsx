// La section « La récolte : le pollen au geste » du catalogue (R19, planche R19-Gain) : la pastille
// « +2 pollen » posée là où le geste a eu lieu, et le rayon qui se vide quand on dépense du miel.
// - le rayon (HoneyComb) qui passe de 7 alvéoles à 3 (`drain`), qu'un bouton rejoue ;
// - la capsule de réactions (ReactionCapsule), l'éventail (ReactionFanPanel) et le composeur de
//   commentaire (CommentComposer), sans gain puis avec (`gain`) ;
// - PollenGainSpot, la boîte qui pose la pastille sur un bouton d'une rangée, au-dessus (`above`)
//   ou à sa droite (`end`), sans gain puis avec.
// Une pastille ne joue qu'à son arrivée et quand sa clé (`trigger`) change : chaque exemple « avec
// gain » a son bouton « Rejouer ». Tout s'affiche de jour puis de nuit, sous un thème imposé.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne. Ses exemples (un outil de
// développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import { REACTION_KINDS, type ReactionKind } from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { CommentComposer } from '../ui/CommentComposer'
import { HoneyComb } from '../ui/HoneyComb'
import { PollenGainSpot } from '../ui/PollenGainSpot'
import { type CapsuleReaction, ReactionCapsule } from '../ui/ReactionCapsule'
import { ReactionFanPanel } from '../ui/ReactionFan'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import type { TextFieldInput } from '../ui/TextField'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'La récolte : le pollen au geste',
  intro:
    'La pastille se pose sur le geste qui a rapporté : la réaction touchée, « Envoyer », un bouton d’une rangée. Le rayon se vide de droite à gauche quand on dépense du miel.',
  day: 'jour',
  night: 'nuit',
  drainTitle: 'HoneyComb drain : de 7 alvéoles à 3',
  replayDrain: 'Rejouer la dépense',
  capsuleTitle: 'ReactionCapsule gain',
  fanTitle: 'ReactionFanPanel gain',
  composerTitle: 'CommentComposer gain',
  spotTitle: 'PollenGainSpot',
  without: 'Sans gain',
  with: 'Avec gain : +{{amount}} pollen',
  replay: 'Rejouer +{{amount}}',
  above: 'above : au-dessus du bouton',
  end: 'end : à droite du bouton',
  comb: 'Mon rayon',
  combValue: '{{cells}} alvéoles sur 10',
  caption: 'Ton commentaire',
  draft: 'Bravo, le quiz marche bien.',
  button: 'Le bouton du geste',
}

const en: typeof fr = {
  title: 'The harvest: pollen at the gesture',
  intro:
    'The badge lands on the gesture that earned it: the reaction touched, “Send”, a button in a row. The comb empties right to left when honey is spent.',
  day: 'day',
  night: 'night',
  drainTitle: 'HoneyComb drain: from 7 cells to 3',
  replayDrain: 'Replay the spending',
  capsuleTitle: 'ReactionCapsule gain',
  fanTitle: 'ReactionFanPanel gain',
  composerTitle: 'CommentComposer gain',
  spotTitle: 'PollenGainSpot',
  without: 'Without gain',
  with: 'With gain: +{{amount}} pollen',
  replay: 'Replay +{{amount}}',
  above: 'above: over the button',
  end: 'end: right of the button',
  comb: 'My comb',
  combValue: '{{cells}} cells out of 10',
  caption: 'Your comment',
  draft: 'Well done, the quiz works.',
  button: 'The gesture’s button',
}

type Labels = typeof fr
type Scheme = 'day' | 'night'
const schemes: Scheme[] = ['day', 'night']
const noop = () => undefined
const fill = (text: string, amount: number) => text.replace('{{amount}}', String(amount))

/** Les cinq réactions, « Bravo » posée par soi : c'est elle que la pastille vise. */
const reactions: CapsuleReaction[] = REACTION_KINDS.map((kind: ReactionKind, i) => ({
  kind,
  count: [9, 14, 4, 6, 21][i] ?? 0,
  mine: kind === 'bravo',
}))

/** Une légende d'exemple, au-dessus de son état. */
function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  )
}

/**
 * Le compteur d'un exemple « avec gain » : 0 tant qu'on n'a pas appuyé (la pastille aurait fini
 * de jouer avant qu'on la regarde), puis une clé neuve à chaque appui.
 */
function useReplay() {
  const [trigger, setTrigger] = useState(0)
  return { trigger, replay: () => setTrigger((n) => n + 1) }
}

function ReplayButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Stack align="start">
      <Button
        label={label}
        variant="secondary"
        size="small"
        icon="arrows-clockwise"
        onPress={onPress}
      />
    </Stack>
  )
}

function DrainSample({ l }: { l: Labels }) {
  const [round, setRound] = useState(0)
  return (
    <Stack gap="sm">
      <Caption>{l.drainTitle}</Caption>
      <HoneyComb
        key={round}
        cells={3}
        label={l.comb}
        valueText={l.combValue.replace('{{cells}}', '3')}
        tint="honey"
        pattern="smooth"
        size="regular"
        drain={{ from: 7 }}
      />
      <ReplayButton label={l.replayDrain} onPress={() => setRound((n) => n + 1)} />
    </Stack>
  )
}

function CapsuleSample({ l }: { l: Labels }) {
  const { trigger, replay } = useReplay()
  return (
    <Stack gap="sm">
      <Caption>{l.without}</Caption>
      <ReactionCapsule reactions={reactions} onToggle={noop} onOpenFan={noop} gain={null} />
      {/* De l'air au-dessus : la pastille naît au-dessus de la réaction et monte. */}
      <Stack gap="xxxl" padding="xl">
        <Caption>{fill(l.with, 2)}</Caption>
        <ReactionCapsule
          reactions={reactions}
          onToggle={noop}
          onOpenFan={noop}
          gain={trigger > 0 ? { amount: 2, trigger, kind: 'bravo' } : null}
        />
      </Stack>
      <ReplayButton label={fill(l.replay, 2)} onPress={replay} />
    </Stack>
  )
}

function FanSample({ l }: { l: Labels }) {
  const { trigger, replay } = useReplay()
  return (
    <Stack gap="sm">
      <Caption>{l.without}</Caption>
      <ReactionFanPanel reactions={reactions} help={false} onToggle={noop} onUnderstood={noop} />
      <Stack gap="xxxl" padding="xl">
        <Caption>{fill(l.with, 2)}</Caption>
        <ReactionFanPanel
          reactions={reactions}
          help={false}
          onToggle={noop}
          onUnderstood={noop}
          gain={trigger > 0 ? { amount: 2, trigger, kind: 'bravo' } : null}
        />
      </Stack>
      <ReplayButton label={fill(l.replay, 2)} onPress={replay} />
    </Stack>
  )
}

function ComposerSample({ l, gain }: { l: Labels; gain: boolean }) {
  const { trigger, replay } = useReplay()
  const [value, setValue] = useState(l.draft)
  const inputRef = useRef<TextFieldInput>(null)
  return (
    <Stack gap="sm">
      <Caption>{gain ? fill(l.with, 3) : l.without}</Caption>
      <CommentComposer
        mentions={false}
        value={value}
        onChangeText={setValue}
        onSend={noop}
        pending={false}
        banner={null}
        onCancelBanner={noop}
        caption={l.caption}
        place="column"
        inputRef={inputRef}
        gain={gain && trigger > 0 ? { amount: 3, trigger } : null}
      />
      {gain ? <ReplayButton label={fill(l.replay, 3)} onPress={replay} /> : null}
    </Stack>
  )
}

function SpotSample({ l, placement }: { l: Labels; placement: 'above' | 'end' }) {
  const { trigger, replay } = useReplay()
  const amount = placement === 'end' ? 25 : 2
  return (
    <Stack gap="sm">
      <Caption>{l[placement]}</Caption>
      <Stack direction="row" gap="lg" align="center" wrap>
        <PollenGainSpot placement={placement}>
          <Button label={l.button} variant="glass" size="small" onPress={noop} />
        </PollenGainSpot>
        <Caption>{l.without}</Caption>
      </Stack>
      <Stack direction="row" gap="lg" align="center" wrap padding="xl">
        <PollenGainSpot placement={placement} gain={trigger > 0 ? { amount, trigger } : null}>
          <Button label={l.button} variant="glass" size="small" onPress={noop} />
        </PollenGainSpot>
        <Button label={fill(l.replay, amount)} variant="secondary" size="small" onPress={replay} />
      </Stack>
    </Stack>
  )
}

/** Les exemples d'un thème. */
function Samples({ l, scheme }: { l: Labels; scheme: Scheme }) {
  const heading = (title: string) => (
    <Text variant="headline" heading={3}>
      {`${title} — ${l[scheme]}`}
    </Text>
  )
  return (
    <Stack gap="lg">
      {heading(l.drainTitle)}
      <DrainSample l={l} />
      {heading(l.capsuleTitle)}
      <CapsuleSample l={l} />
      {heading(l.fanTitle)}
      <FanSample l={l} />
      {heading(l.composerTitle)}
      <ComposerSample l={l} gain={false} />
      <ComposerSample l={l} gain />
      {heading(l.spotTitle)}
      <SpotSample l={l} placement="above" />
      <SpotSample l={l} placement="end" />
    </Stack>
  )
}

export function HarvestGainsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Surface variant="grouped" padding="lg" gap="lg">
            <Samples l={l} scheme={scheme} />
          </Surface>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
