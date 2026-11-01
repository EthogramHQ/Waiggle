// La section « Éventail des réactions et vue de l'auteur » du catalogue (R5a, U3) : l'éventail
// (ReactionFanPanel, le contenu de ReactionFan sans sa couche) avec et sans l'aide de la première
// fois, avec des réactions posées (« Ta réaction » et « Retirer »), de jour et de nuit, et à 320
// points ; un exemple vivant ouvre le vrai éventail par-dessus la page, depuis la capsule (appui
// long ou clic droit). Puis le bloc de l'auteur (OwnReactions) : à zéro, avec des nombres, et pour
// un compte suspendu.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { radii, space } from '@ruche/brand'
import { REACTION_KINDS, type ReactionKind } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientLight } from '../ui/AmbientLight'
import { Button } from '../ui/Button'
import { type OwnReaction, OwnReactions } from '../ui/OwnReactions'
import { ReactionCapsule } from '../ui/ReactionCapsule'
import { type FanReaction, ReactionFan, ReactionFanPanel } from '../ui/ReactionFan'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

// Un résumé flou (ThumbHash) d'un visuel de projet, le même que celui de CatalogueScreen. Il
// ressemble à une clé secrète pour l'outil qui cherche les secrets oubliés (gitleaks) : le
// commentaire « gitleaks:allow » lui indique que ce n'en est pas une.
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

const fr = {
  title: 'Éventail des réactions et vue de l’auteur',
  intro:
    'L’éventail s’ouvre par un appui long sur la capsule (ou un clic droit, la touche Menu, l’action du lecteur d’écran), par-dessus la page floutée : chaque réaction avec son nom et son nombre. Une ligne pose sa réaction ; sur une réaction posée, « Ta réaction » et un bouton « Retirer » à part. Il reste ouvert après un choix, et se ferme par un toucher à côté, Échap ou Retour. L’aide du haut ne paraît qu’une fois par appareil. L’auteur, lui, lit les nombres sans pouvoir réagir.',
  live: 'Vivant : appui long ou clic droit sur la capsule, ou le bouton, pour ouvrir l’éventail',
  open: 'Ouvrir l’éventail',
  withHelp: 'La première fois : l’aide en haut',
  mine: 'Deux réactions posées (Utile, Waggle !) : « Ta réaction » et « Retirer »',
  none: 'Aucune réaction posée, sans l’aide',
  narrow: '320 points de large, l’aide affichée',
  ownTitle: 'Le bloc de l’auteur (OwnReactions)',
  ownCounts: 'Avec des nombres, « 0 » compris',
  ownZero: 'Tout à zéro : « Pas encore de réaction »',
  ownSuspended: 'Compte suspendu sans réaction à retirer : les nombres seuls',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Reaction fan and the author’s view',
  intro:
    'The fan opens with a long press on the capsule (or a right click, the Menu key, the screen reader action), over the blurred page: each reaction with its name and count. A row adds its reaction; on one already added, “Your reaction” and a separate “Remove” button. It stays open after a choice, and closes with a tap beside it, Escape or Back. The help at the top shows once per device. The author reads the counts without being able to react.',
  live: 'Live: long press or right click on the capsule, or the button, to open the fan',
  open: 'Open the fan',
  withHelp: 'The first time: the help at the top',
  mine: 'Two reactions added (Useful, Waggle!): “Your reaction” and “Remove”',
  none: 'No reaction added, without the help',
  narrow: '320 points wide, with the help',
  ownTitle: 'The author’s block (OwnReactions)',
  ownCounts: 'With counts, “0” included',
  ownZero: 'All at zero: “No reactions yet”',
  ownSuspended: 'Suspended account with nothing to remove: the counts alone',
  day: 'day',
  night: 'night',
}

const noop = () => {}

type Counts = Record<ReactionKind, number>
const counts: Counts = { amazing: 9, inspiring: 14, useful: 4, funny: 6, bravo: 21 }
const some: Counts = { amazing: 3, inspiring: 0, useful: 1, funny: 0, bravo: 5 }
const zero: Counts = { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 0 }

/** Les cinq réactions de l'éventail : un nombre, et si c'est la sienne. */
const fan = (values: Counts, mine: ReactionKind[] = []): FanReaction[] =>
  REACTION_KINDS.map((kind) => ({ kind, count: values[kind], mine: mine.includes(kind) }))
/** Les cinq nombres du bloc de l'auteur. */
const own = (values: Counts): OwnReaction[] =>
  REACTION_KINDS.map((kind) => ({ kind, count: values[kind] }))

export function FanCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <LiveSample caption={l.live} openLabel={l.open} />

      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.withHelp} — ${l[scheme]}`}>
              <Backdrop>
                <ReactionFanPanel
                  reactions={fan(counts, ['bravo'])}
                  help
                  onToggle={noop}
                  onUnderstood={noop}
                />
              </Backdrop>
            </Example>
            <Example caption={`${l.mine} — ${l[scheme]}`}>
              <Backdrop>
                <ReactionFanPanel
                  reactions={fan({ ...counts, useful: 5 }, ['useful', 'bravo'])}
                  help={false}
                  onToggle={noop}
                  onUnderstood={noop}
                />
              </Backdrop>
            </Example>
            <Example caption={`${l.ownCounts} — ${l[scheme]}`}>
              <OwnReactions reactions={own(some)} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Example caption={l.none}>
        <Backdrop>
          <ReactionFanPanel
            reactions={fan(counts)}
            help={false}
            onToggle={noop}
            onUnderstood={noop}
          />
        </Backdrop>
      </Example>
      <Example caption={l.narrow}>
        <View style={{ width: 320 - 2 * space.lg, maxWidth: '100%' }}>
          <Backdrop>
            <ReactionFanPanel
              reactions={fan(counts, ['bravo'])}
              help
              onToggle={noop}
              onUnderstood={noop}
            />
          </Backdrop>
        </View>
      </Example>

      <Text variant="headline" heading={3}>
        {l.ownTitle}
      </Text>
      <Example caption={l.ownZero}>
        <OwnReactions reactions={own(zero)} />
      </Example>
      <Example caption={l.ownSuspended}>
        <OwnReactions viewer="suspended" reactions={own({ ...counts, inspiring: 0 })} />
      </Example>
    </Stack>
  )
}

/** L'éventail pour de vrai : la capsule l'ouvre, il pose et retire, et se ferme comme sur la page. */
function LiveSample({ caption, openLabel }: { caption: string; openLabel: string }) {
  const [mine, setMine] = useState<ReactionKind[]>(['bravo'])
  const [open, setOpen] = useState(false)
  const values = Object.fromEntries(
    REACTION_KINDS.map((kind) => [kind, counts[kind] + (mine.includes(kind) ? 1 : 0)]),
  ) as Counts
  const toggle = (kind: ReactionKind) =>
    setMine((all) => (all.includes(kind) ? all.filter((k) => k !== kind) : [...all, kind]))
  return (
    <Example caption={caption}>
      <ReactionCapsule
        reactions={fan(values, mine)}
        onToggle={toggle}
        onOpenFan={() => setOpen(true)}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={openLabel} variant="secondary" size="small" onPress={() => setOpen(true)} />
      </View>
      <ReactionFan
        open={open}
        reactions={fan(values, mine)}
        onToggle={toggle}
        onClose={() => setOpen(false)}
      />
    </Example>
  )
}

/** Une photo floue derrière l'éventail, comme la page qu'il recouvre : le verre se voit. */
function Backdrop({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        overflow: 'hidden',
        borderRadius: radii.tile,
        paddingVertical: space.xl,
        paddingHorizontal: space.md,
        alignItems: 'center',
      }}
    >
      <AmbientLight thumbhash={papillon} />
      {children}
    </View>
  )
}

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
