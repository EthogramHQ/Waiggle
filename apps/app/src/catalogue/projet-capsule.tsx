// La section « Capsule des réactions » du catalogue (R5a, U2) : la capsule de verre de la page
// projet (ReactionCapsule) dans tous ses états, de jour et de nuit. Au repos, avec des réactions à
// soi (miel plein), tout à zéro, de grands nombres, un compte suspendu (verrouillées et inactive),
// l'erreur avec « Me reconnecter », 320 points de large, et posée sur une photo. Un exemple vivant
// pose et retire pour de vrai : on y voit la goutte, l'anneau, le rebond, le nombre qui roule et la
// danse de l'abeille ; un appui long ou un clic droit y compte les ouvertures de l'éventail.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes du composant viennent de l'appli.
import { radii, space } from '@ruche/brand'
import { REACTION_KINDS, type ReactionKind } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientLight } from '../ui/AmbientLight'
import { ReactionCapsule, type ReactionCapsuleItem } from '../ui/ReactionCapsule'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

// Un résumé flou (ThumbHash) d'un visuel de projet, le même que celui de CatalogueScreen. Il
// ressemble à une clé secrète pour l'outil qui cherche les secrets oubliés (gitleaks) : le
// commentaire « gitleaks:allow » lui indique que ce n'en est pas une.
const papillon = 'GdkFJYTHYFSbVnaPWUZndpajf7QG' // gitleaks:allow

const fr = {
  title: 'Capsule des réactions',
  intro:
    'La capsule de verre de la page projet : les cinq réactions en icônes, chacune avec son nombre ; « Waggle ! » est l’abeille du logo. Les siennes sont en miel plein. Toucher pose ou retire ; un appui long, un clic droit ou la touche Menu ouvrent l’éventail, sans rien poser. Le lecteur d’écran lit le nom complet (« Waggle !, 21, ta réaction »). La page la pose : en bas de l’écran sur téléphone, à cheval sur la photo sur ordinateur.',
  rest: 'Au repos, aucune réaction à soi',
  mine: 'Deux réactions à soi (Inspirant, Waggle !), miel plein',
  live: 'Vivante : touche pour poser ou retirer, appui long pour l’éventail',
  fanOpened: 'Éventail ouvert : {{count}} fois',
  zero: 'Tout à zéro (un projet tout neuf)',
  big: 'De grands nombres',
  suspended:
    'Compte suspendu : les verrouillées montrent leur nombre ; Waggle !, retirée pendant la visite, reste à sa place, inactive',
  error: 'Erreur, avec « Me reconnecter », au-dessus de la capsule',
  errorText: 'Ta session a expiré. Reconnecte-toi pour continuer.',
  signIn: 'Me reconnecter',
  narrow: '320 points de large',
  onPhoto: 'Sur une photo',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Reaction capsule',
  intro:
    'The glass capsule of the project page: the five reactions as icons, each with its count; “Waggle!” is the logo’s bee. Your own are in solid honey. A tap adds or removes; a long press, a right click or the Menu key open the fan, without adding anything. Screen readers read the full name (“Waggle!, 21, your reaction”). The page places it: at the bottom of the screen on phones, straddling the photo on computers.',
  rest: 'At rest, none of your own',
  mine: 'Two of your own (Inspiring, Waggle!), solid honey',
  live: 'Live: tap to add or remove, long press for the fan',
  fanOpened: 'Fan opened: {{count}} times',
  zero: 'All at zero (a brand-new project)',
  big: 'Large counts',
  suspended:
    'Suspended account: locked ones show their count; Waggle!, removed during the visit, stays in place, inactive',
  error: 'Error, with “Sign in again”, above the capsule',
  errorText: 'Your session has expired. Sign in again to continue.',
  signIn: 'Sign in again',
  narrow: '320 points wide',
  onPhoto: 'On a photo',
  day: 'day',
  night: 'night',
}

const noop = () => {}

type Counts = Record<ReactionKind, number>
const counts: Counts = { amazing: 9, inspiring: 14, useful: 4, funny: 6, bravo: 21 }
const zero: Counts = { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 0 }
const big: Counts = { amazing: 128, inspiring: 1042, useful: 87, funny: 356, bravo: 2210 }

/** Hook : les cinq réactions, préparées comme la page les prépare (nom lu complet). */
function useItems() {
  const { t } = useTranslation()
  return (
    values: Counts,
    mine: ReactionKind[] = [],
    extra: (kind: ReactionKind) => Partial<ReactionCapsuleItem> = () => ({}),
  ): ReactionCapsuleItem[] =>
    REACTION_KINDS.map((kind) => {
      const text = t(($) => $.project.reactions[kind])
      const isMine = mine.includes(kind)
      const count = values[kind]
      return {
        kind,
        text,
        count,
        mine: isMine,
        label: t(($) => (isMine ? $.project.reactions.labelMine : $.project.reactions.label), {
          name: text,
          count,
        }),
        ...extra(kind),
      }
    })
}

export function CapsuleCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const items = useItems()
  const group = t(($) => $.project.reactions.group)
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <LiveSample caption={l.live} fanLabel={l.fanOpened} group={group} />

      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.rest} — ${l[scheme]}`}>
              <ReactionCapsule
                items={items(counts)}
                onToggle={noop}
                onOpenFan={noop}
                label={group}
              />
            </Example>
            <Example caption={`${l.mine} — ${l[scheme]}`}>
              <ReactionCapsule
                items={items({ ...counts }, ['inspiring', 'bravo'])}
                onToggle={noop}
                onOpenFan={noop}
                label={group}
              />
            </Example>
            <Example caption={`${l.onPhoto} — ${l[scheme]}`}>
              <View
                style={{
                  minHeight: 180,
                  overflow: 'hidden',
                  borderRadius: radii.tile,
                  justifyContent: 'flex-end',
                  padding: space.lg,
                }}
              >
                <AmbientLight thumbhash={papillon} />
                <ReactionCapsule
                  items={items(counts, ['bravo'])}
                  onToggle={noop}
                  onOpenFan={noop}
                  label={group}
                />
              </View>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Example caption={l.zero}>
        <ReactionCapsule items={items(zero)} onToggle={noop} onOpenFan={noop} label={group} />
      </Example>
      <Example caption={l.big}>
        <ReactionCapsule
          items={items(big, ['amazing'])}
          onToggle={noop}
          onOpenFan={noop}
          label={group}
        />
      </Example>
      <Example caption={l.suspended}>
        {/* Comme la page : Inspirant est encore donnée (un bouton, pour la retirer) ; Waggle !
            a été retirée pendant la visite (inactive) ; les autres sont verrouillées. */}
        <ReactionCapsule
          items={items(counts, ['inspiring'], (kind) => ({
            locked: kind !== 'inspiring' && kind !== 'bravo',
            disabled: kind === 'bravo',
          }))}
          onToggle={noop}
          label={group}
        />
      </Example>
      <Example caption={l.error}>
        <ReactionCapsule
          items={items(counts, ['bravo'])}
          onToggle={noop}
          onOpenFan={noop}
          label={group}
          error={l.errorText}
          errorAction={{ label: l.signIn, onPress: noop }}
        />
      </Example>
      <Example caption={l.narrow}>
        <View style={{ width: 320 - 2 * space.lg, maxWidth: '100%' }}>
          <ReactionCapsule
            items={items(big, ['useful', 'bravo'])}
            onToggle={noop}
            onOpenFan={noop}
            label={group}
          />
        </View>
      </Example>
    </Stack>
  )
}

/** La capsule qui pose et retire pour de vrai, comme sur la page : le mouvement se voit. */
function LiveSample({
  caption,
  fanLabel,
  group,
}: {
  caption: string
  fanLabel: string
  group: string
}) {
  const items = useItems()
  const [mine, setMine] = useState<ReactionKind[]>(['inspiring'])
  const [opened, setOpened] = useState(0)
  const values = Object.fromEntries(
    REACTION_KINDS.map((kind) => [kind, counts[kind] + (mine.includes(kind) ? 1 : 0)]),
  ) as Counts
  const toggle = (kind: ReactionKind) =>
    setMine((all) => (all.includes(kind) ? all.filter((k) => k !== kind) : [...all, kind]))
  return (
    <Example caption={caption}>
      <ReactionCapsule
        items={items(values, mine)}
        onToggle={toggle}
        onOpenFan={() => setOpened((n) => n + 1)}
        label={group}
      />
      <Text variant="caption" tone="muted">
        {fanLabel.replace('{{count}}', String(opened))}
      </Text>
    </Example>
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
