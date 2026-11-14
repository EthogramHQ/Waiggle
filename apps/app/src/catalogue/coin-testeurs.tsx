// La section « Le coin des testeurs : appels, retours réglés, onglets » du catalogue (tranche R7b),
// dans tous leurs états, de jour et de nuit :
// - les onglets à icône du coin (`Tabs` avec `icon`) : « Appels » et son mégaphone, « Retours » et
//   sa bulle, sur le verre (posés sur le miel), puis groupés sur une surface pleine ;
// - `CallCard`, la carte d'un appel : avec photo décrite et le menu de l'auteur, sans photo avec le
//   menu d'un testeur, une photo sans description (nommée « Photo jointe à l'appel »), un long appel
//   à plusieurs lignes, un appel retiré par la modération, sans aucune action, et sur 320 points ;
// - `SettledFeedbackField`, la partie « Retours réglés » de la feuille de mise à jour : rien de
//   coché, deux cases cochées avec un ancien testeur, à la limite (cases restantes inactives et la
//   phrase qui le dit), et pendant la publication (tout inactif). Les cases se cochent pour de vrai.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés et ses exemples (un outil de développement, absent de
// l'appli publiée) sont écrits ici, en français et en anglais ; les textes des composants viennent
// de l'appli.
import { type ColorName, palettes, radii, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { ActionMenuItem } from '../ui/ActionMenu'
import { CallCard } from '../ui/CallCard'
import type { ImageSource } from '../ui/image'
import { RemovalNotice } from '../ui/RemovalNotice'
import { SettledFeedbackField, type SettledFeedbackItem } from '../ui/SettledFeedbackField'
import { Stack } from '../ui/Stack'
import { Tabs } from '../ui/Tabs'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le coin des testeurs : appels, retours réglés, onglets',
  intro:
    'Les onglets du coin, la carte d’un appel que l’auteur lance à ses testeurs, et la partie « Retours réglés » de la feuille « Nouvelle mise à jour », où l’auteur coche les retours que sa version règle.',
  tabsTitle: 'Les onglets du coin',
  tabsGlass: 'Sur le verre, posés sur le miel (« Appels » choisi)',
  tabsGrouped: 'Groupés, sur une surface pleine (« Retours » choisi)',
  callsBody: 'Les appels que l’auteur lance à ses testeurs.',
  feedbackBody: 'Les retours des testeurs, un fil par testeur.',
  callsTitle: 'La carte d’un appel',
  withPhoto: 'Avec une photo décrite, menu de l’auteur',
  noPhoto: 'Sans photo, menu d’un testeur',
  undescribed: 'Photo sans description : « Photo jointe à l’appel »',
  long: 'Long appel, sur plusieurs lignes',
  removed: 'Retiré par la modération, vu par l’auteur',
  noMenu: 'Sans action',
  narrow: 'Sur 320 points',
  settledTitle: 'Les retours réglés',
  none: 'Rien de coché (les cases se cochent)',
  some: 'Deux cochées, dont un ancien testeur',
  full: 'À la limite (2 au plus) : les cases restantes inactives',
  busy: 'Pendant la publication : tout inactif',
  callPhoto:
    'Nouveau niveau caché sur Saturne ! Essayez-le ce week-end, et dites-moi si la fusée décolle bien à la fin.',
  callPlain:
    'Essayez le niveau 3 ce week-end, surtout sur téléphone. Yanis dit que son score repart à zéro : ça vous le fait aussi ?',
  callShort: 'Testez la musique du niveau 2.',
  callLong:
    'Grosse mise à jour ce soir.\nLe mode nuit est arrivé, les questions vont moins vite pour les petits, et il y a trois nouveaux niveaux.\n\nEssayez-les dans l’ordre, notez combien de temps chacun vous prend, et dites-moi surtout si quelque chose vous paraît trop dur.',
  description: 'La fusée du quiz sur son pas de tir, au crépuscule',
  removedTitle: 'Retiré par la modération',
  removedLine: 'Motif : contenu blessant. Tu peux contester cette décision depuis tes réglages.',
  // R9 : la photo d'un appel retirée seule, vue par son auteur.
  photoRemoved: 'Photo retirée seule par la modération, vue par l’auteur',
  photoWhy: 'La photo montre le visage d’un enfant, sans l’accord de ses parents.',
  photoSubject: 'Contestation : retrait de la photo de « Décollage ! » du 12 novembre',
  ines: 'Inès Morel',
  hugo: 'Hugo Lefèvre',
  lea: 'Léa Martin',
  partly: 'En partie',
  no: 'Non',
  yes: 'Oui',
  inesExcerpt: 'Le score repart à zéro au niveau 3',
  hugoExcerpt: 'Sur ma tablette, la fusée reste bloquée au départ',
  inesDate: '2 nov.',
  hugoDate: 'mardi',
  leaDate: '4 nov.',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The testers corner: calls, settled feedback, tabs',
  intro:
    'The corner tabs, the card of a call the author sends to their testers, and the “Settled feedback” part of the “New update” sheet, where the author checks the feedback their version settles.',
  tabsTitle: 'The corner tabs',
  tabsGlass: 'On glass, over the honey (“Calls” chosen)',
  tabsGrouped: 'Grouped, on a plain surface (“Feedback” chosen)',
  callsBody: 'The calls the author sends to their testers.',
  feedbackBody: 'The testers’ feedback, one thread per tester.',
  callsTitle: 'The card of a call',
  withPhoto: 'With a described photo, the author’s menu',
  noPhoto: 'Without a photo, a tester’s menu',
  undescribed: 'Photo without a description: “Photo attached to the call”',
  long: 'A long call, on several lines',
  removed: 'Removed by the moderation, seen by the author',
  noMenu: 'No action',
  narrow: 'At 320 points',
  settledTitle: 'The settled feedback',
  none: 'Nothing checked (the boxes can be checked)',
  some: 'Two checked, one by a former tester',
  full: 'At the limit (2 at most): the other boxes inactive',
  busy: 'While publishing: all inactive',
  callPhoto:
    'New hidden level on Saturn! Try it this weekend, and tell me if the rocket takes off properly at the end.',
  callPlain:
    'Try level 3 this weekend, especially on a phone. Yanis says his score goes back to zero: does it happen to you too?',
  callShort: 'Test the music of level 2.',
  callLong:
    'Big update tonight.\nNight mode is here, the questions go slower for the little ones, and there are three new levels.\n\nTry them in order, note how long each one takes you, and above all tell me if anything feels too hard.',
  description: 'The quiz rocket on its launch pad, at dusk',
  removedTitle: 'Removed by the moderation',
  removedLine: 'Reason: hurtful content. You can appeal this decision from your settings.',
  photoRemoved: 'Photo removed alone by moderation, seen by the author',
  photoWhy: 'The photo shows a child’s face, without their parents’ consent.',
  photoSubject: 'Appeal: removal of the photo of “Lift-off!” of November 12',
  ines: 'Inès Morel',
  hugo: 'Hugo Lefèvre',
  lea: 'Léa Martin',
  partly: 'Partly',
  no: 'No',
  yes: 'Yes',
  inesExcerpt: 'The score goes back to zero at level 3',
  hugoExcerpt: 'On my tablet, the rocket stays stuck at the start',
  inesDate: 'Nov 2',
  hugoDate: 'Tuesday',
  leaDate: 'Nov 4',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
type CornerKey = 'calls' | 'feedback'
const noop = () => {}
const schemes = ['day', 'night'] as const

/**
 * Les dates des appels : fixes, jamais calculées depuis maintenant. La page web est pré-rendue à la
 * construction : une date tirée de l'heure qu'il est différerait entre le serveur et le navigateur
 * (erreur d'hydratation 418). Après l'hydratation, la carte les dit par rapport à aujourd'hui.
 * Elles précèdent l'heure figée des captures (le 20 octobre 2026 à midi, `scripts/shots.mjs`) :
 * « il y a 2 h » et « 14 oct. » sur les captures, plutôt que « à l'instant » pour une date à venir.
 */
const RECENT = '2026-10-20T08:00:00.000Z'
const OLDER = '2026-10-14T07:15:00.000Z'

/**
 * Une image d'exemple (le dépôt n'en contient aucune) : un dégradé SVG entre deux couleurs de la
 * marque, et un disque d'une troisième (comme coin-entetes.tsx). Les couleurs viennent de
 * @ruche/brand (palette de jour : une image ne change pas avec le thème), jamais écrites à la main.
 */
const sample = (from: ColorName, to: ColorName, disc: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day[from]}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/><circle cx="280" cy="80" r="50" fill="${day[disc]}"/></svg>`,
    )}`,
  }
}
const rocket = sample('honey', 'amber', 'honeySoft')

/**
 * Un exemple légendé (« Sans photo — nuit »), dans la largeur d'une colonne de téléphone, posé sur
 * le fond de page de son thème : de nuit, le titre et l'aide d'une partie se lisent sur le noir,
 * comme dans l'appli, et non sur le fond clair du catalogue.
 */
function Example({
  caption,
  narrow = false,
  children,
}: {
  caption: string
  /** Dans un cadre de 320 points, le plus petit téléphone. */
  narrow?: boolean
  children: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <Stack gap="xs">
      <View
        style={{
          width: narrow ? 320 : 390,
          maxWidth: '100%',
          backgroundColor: colors.background,
          borderRadius: radii.tile,
          padding: space.md,
        }}
      >
        {children}
      </View>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

/** Une partie « Retours réglés » dont les cases se cochent pour de vrai. */
function LiveSettled({
  items,
  initial,
  max,
  editable = true,
}: {
  items: SettledFeedbackItem[]
  initial: string[]
  max: number
  editable?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <SettledFeedbackField
      items={items}
      value={value}
      onChange={setValue}
      max={max}
      editable={editable}
    />
  )
}

/** Les onglets du coin, sur le verre (posés sur le miel), puis groupés. */
function CornerTabs({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [glassTab, setGlassTab] = useState<CornerKey>('calls')
  const [groupedTab, setGroupedTab] = useState<CornerKey>('feedback')
  const label = t(($) => $.project.testers.tabs.label)
  // Le texte des panneaux : à l'encre sur le miel (de nuit aussi, le miel reste clair), au ton
  // ordinaire sur une surface pleine.
  const tabsOn = (tone: 'onHoney' | 'default') => [
    {
      key: 'calls' as const,
      label: t(($) => $.project.testers.tabs.calls),
      icon: 'megaphone-simple' as const,
      content: <Text tone={tone}>{l.callsBody}</Text>,
    },
    {
      key: 'feedback' as const,
      label: t(($) => $.project.testers.tabs.feedback),
      icon: 'chat-circle-dots' as const,
      content: <Text tone={tone}>{l.feedbackBody}</Text>,
    },
  ]
  return (
    <Stack gap="lg">
      <Example caption={l.tabsGlass}>
        {/* Sur le verre : un coin de miel vif, comme la lumière d'ambiance du coin. */}
        <View
          style={{ backgroundColor: colors.honey, borderRadius: radii.tile, padding: space.xl }}
        >
          <Tabs label={label} tabs={tabsOn('onHoney')} selected={glassTab} onSelect={setGlassTab} />
        </View>
      </Example>
      <Example caption={l.tabsGrouped}>
        <Tabs
          label={label}
          tabs={tabsOn('default')}
          selected={groupedTab}
          onSelect={setGroupedTab}
          variant="grouped"
        />
      </Example>
    </Stack>
  )
}

export function TestersCornerCatalogue() {
  const { t, i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const authorMenu: ActionMenuItem[] = [
    {
      label: t(($) => $.project.testers.calls.delete),
      onPress: noop,
      tone: 'danger',
      icon: 'trash',
    },
  ]
  const testerMenu: ActionMenuItem[] = [
    { label: t(($) => $.project.testers.calls.report), onPress: noop, icon: 'flag' },
  ]
  const removal = <RemovalNotice title={l.removedTitle} lines={[l.removedLine]} compact />

  // Les retours à traiter, écrits comme l'écran les écrira (`settledField.item`, `detail`).
  const item = (name: string, outcome: string) =>
    t(($) => $.project.testers.settledField.item, { name, outcome })
  const detail = (excerpt: string, date: string) =>
    t(($) => $.project.testers.settledField.detail, { excerpt, date })
  const items: SettledFeedbackItem[] = [
    {
      id: 'ines',
      label: item(l.ines, l.partly),
      detail: detail(l.inesExcerpt, l.inesDate),
      former: false,
    },
    {
      id: 'hugo',
      label: item(l.hugo, l.no),
      detail: detail(l.hugoExcerpt, l.hugoDate),
      former: true,
    },
    {
      id: 'lea',
      label: item(l.lea, l.yes),
      detail: t(($) => $.project.testers.settledField.detailNoText, { date: l.leaDate }),
      former: false,
    },
  ]

  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Text variant="headline" heading={3}>
        {l.tabsTitle}
      </Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <CornerTabs
            l={{
              ...l,
              tabsGlass: `${l.tabsGlass} — ${l[scheme]}`,
              tabsGrouped: `${l.tabsGrouped} — ${l[scheme]}`,
            }}
          />
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.callsTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.withPhoto} — ${l[scheme]}`}>
              <CallCard
                text={l.callPhoto}
                at={RECENT}
                photo={{ source: rocket, description: l.description }}
                menu={authorMenu}
              />
            </Example>
            <Example caption={`${l.noPhoto} — ${l[scheme]}`}>
              <CallCard text={l.callPlain} at={OLDER} menu={testerMenu} />
            </Example>
            <Example caption={`${l.undescribed} — ${l[scheme]}`}>
              <CallCard
                text={l.callShort}
                at={OLDER}
                photo={{ source: rocket, description: '' }}
                menu={testerMenu}
              />
            </Example>
            <Example caption={`${l.long} — ${l[scheme]}`}>
              <CallCard text={l.callLong} at={RECENT} menu={authorMenu} />
            </Example>
            <Example caption={`${l.removed} — ${l[scheme]}`}>
              <CallCard text={l.callPlain} at={OLDER} removal={removal} menu={authorMenu} />
            </Example>
            <Example caption={`${l.photoRemoved} — ${l[scheme]}`}>
              <CallCard
                text={l.callPhoto}
                at={RECENT}
                photo={{ source: rocket, description: l.description }}
                photoRemoval={{
                  removal: {
                    ground: 'rules',
                    explanation: l.photoWhy,
                    at: '2026-11-12T11:00:00.000Z',
                    afterReport: false,
                  },
                  contestSubject: l.photoSubject,
                }}
                menu={authorMenu}
              />
            </Example>
            <Example caption={`${l.noMenu} — ${l[scheme]}`}>
              <CallCard text={l.callShort} at={OLDER} />
            </Example>
            <Example caption={`${l.narrow} — ${l[scheme]}`} narrow>
              <CallCard
                text={l.callPhoto}
                at={RECENT}
                photo={{ source: rocket, description: l.description }}
                menu={testerMenu}
              />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.settledTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.none} — ${l[scheme]}`}>
              <LiveSettled items={items} initial={[]} max={20} />
            </Example>
            <Example caption={`${l.some} — ${l[scheme]}`}>
              <LiveSettled items={items} initial={['ines', 'hugo']} max={20} />
            </Example>
            <Example caption={`${l.full} — ${l[scheme]}`}>
              <LiveSettled items={items} initial={['ines', 'hugo']} max={2} />
            </Example>
            <Example caption={`${l.busy} — ${l[scheme]}`} narrow>
              <LiveSettled items={items} initial={['ines']} max={20} editable={false} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
