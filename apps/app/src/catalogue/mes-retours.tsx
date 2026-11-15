// Section du catalogue : « Mes retours envoyés » (tranche R11, planche R11-Mes-Retours), la carte
// d'un projet et ses messages (`ui/SentFeedback`), dans tous leurs états : coin ouvert, avec issue,
// capture et réponse ; coin fermé (« Seuls tes messages restent ici. ») ; projet qu'on ne voit
// plus ; message retiré par la modération. De jour et de nuit, dans une colonne de téléphone.
// Les textes d'exemple sont écrits ici (exception du catalogue, outil de développement).
import { palettes } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { SentFeedbackGroup, SentFeedbackMessage } from '../ui/SentFeedback'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Mes retours envoyés',
  open: 'Coin ouvert : « Ouvrir le coin », lu « Ouvrir le coin des testeurs de Décollage ! »',
  closed: 'Coin fermé : la pastille au cadenas et qui voit quoi',
  gone: 'Projet qui n’est plus visible : ni vignette, ni auteur, ni lien',
  removed: 'Message retiré par la modération',
  day: 'jour',
  night: 'nuit',
  openTitle: 'Décollage !',
  closedTitle: 'Quel papillon ?',
  goneTitle: 'Projet qui n’est plus visible',
  openCorner: 'Ouvrir le coin',
  openCornerNamed: 'Ouvrir le coin des testeurs de Décollage !',
  closedLabel: 'Coin fermé',
  closedNote: 'Seuls tes messages restent ici.',
  partly: 'En partie',
  no: 'Non',
  spokenPartly: 'Ça a marché : En partie',
  spokenNo: 'Ça a marché : Non',
  capture: 'Capture d’écran jointe à ton retour',
  removedNote: 'Retiré par la modération',
  delete: 'Supprimer',
  deleteNamed: (excerpt: string) => `Supprimer le message : ${excerpt}`,
  feedback: 'Le score repart à zéro au niveau 3.',
  reply: 'Merci ! Je réessaie demain sur la tablette.',
  closedText: 'La photo du papillon ne se charge pas sur Firefox.',
  goneText: 'L’arrosage s’est lancé deux fois cette nuit.',
}
const en: typeof fr = {
  title: 'My sent feedback',
  open: 'Open corner: “Open the corner”, read “Open the testers’ corner of Liftoff!”',
  closed: 'Closed corner: the padlock pill and who sees what',
  gone: 'Project no longer visible: no thumbnail, no author, no link',
  removed: 'Message removed by moderation',
  day: 'day',
  night: 'night',
  openTitle: 'Liftoff!',
  closedTitle: 'Which butterfly?',
  goneTitle: 'Project no longer visible',
  openCorner: 'Open the corner',
  openCornerNamed: 'Open the testers’ corner of Liftoff!',
  closedLabel: 'Corner closed',
  closedNote: 'Only your messages stay here.',
  partly: 'Partly',
  no: 'No',
  spokenPartly: 'Did it work: Partly',
  spokenNo: 'Did it work: No',
  capture: 'Screenshot attached to your feedback',
  removedNote: 'Removed by moderation',
  delete: 'Delete',
  deleteNamed: (excerpt: string) => `Delete the message: ${excerpt}`,
  feedback: 'The score goes back to zero at level 3.',
  reply: 'Thanks! I’ll try again tomorrow on the tablet.',
  closedText: 'The butterfly photo doesn’t load in Firefox.',
  goneText: 'The watering started twice last night.',
}
type Labels = typeof fr

const schemes = ['day', 'night'] as const
const noop = () => {}

/** L'heure du catalogue, figée : les dates relatives ne changent pas d'une capture à l'autre. */
const NOW = new Date('2026-11-15T12:00:00.000Z')

// Une capture de téléphone d'exemple, dessinée en SVG (palette de jour : une image ne change pas
// avec le thème), sans photo à télécharger.
const day = palettes.day
const PORTRAIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844"><rect width="390" height="844" fill="${day.background}"/><rect x="24" y="40" width="342" height="64" rx="16" fill="${day.honey}"/><rect x="24" y="140" width="250" height="24" rx="12" fill="${day.textMuted}"/><rect x="24" y="200" width="342" height="420" rx="24" fill="${day.text}"/><rect x="24" y="740" width="342" height="64" rx="32" fill="${day.honey}"/></svg>`
const portrait = { uri: `data:image/svg+xml;utf8,${encodeURIComponent(PORTRAIT_SVG)}` }

/** Un exemple légendé, dans une colonne de téléphone (390 points moins ses marges). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <View style={{ maxWidth: 358 }}>{children}</View>
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

function Cards({ l, scheme }: { l: Labels; scheme: (typeof schemes)[number] }) {
  const deleting = (text: string) => ({
    deleteLabel: l.delete,
    deleteSpokenLabel: l.deleteNamed(text),
    onDelete: noop,
  })
  return (
    <Stack gap="lg">
      <Example caption={`${l.open} — ${l[scheme]}`}>
        <SentFeedbackGroup
          title={l.openTitle}
          subtitle="Papi Jean"
          open={{ label: l.openCorner, spokenLabel: l.openCornerNamed, onPress: noop }}
        >
          <SentFeedbackMessage
            outcome={{ value: 'partly', label: l.partly, spokenLabel: l.spokenPartly }}
            at="2026-11-15T09:00:00.000Z"
            now={NOW}
            text={l.feedback}
            capture={{ source: portrait, width: 390, height: 844, description: l.capture }}
            {...deleting(l.feedback)}
          />
          <SentFeedbackMessage
            outcome={null}
            at="2026-11-12T18:00:00.000Z"
            now={NOW}
            text={l.reply}
            capture={null}
            {...deleting(l.reply)}
          />
        </SentFeedbackGroup>
      </Example>
      <Example caption={`${l.closed} — ${l[scheme]}`}>
        <SentFeedbackGroup
          title={l.closedTitle}
          subtitle="Hugo Lefèvre"
          closed={{ label: l.closedLabel, note: l.closedNote }}
        >
          <SentFeedbackMessage
            outcome={{ value: 'no', label: l.no, spokenLabel: l.spokenNo }}
            at="2026-11-02T10:00:00.000Z"
            now={NOW}
            text={l.closedText}
            capture={null}
            {...deleting(l.closedText)}
          />
        </SentFeedbackGroup>
      </Example>
      <Example caption={`${l.gone} — ${l[scheme]}`}>
        <SentFeedbackGroup title={l.goneTitle} gone>
          <SentFeedbackMessage
            outcome={null}
            at="2026-10-21T21:00:00.000Z"
            now={NOW}
            text={l.goneText}
            capture={null}
            {...deleting(l.goneText)}
          />
        </SentFeedbackGroup>
      </Example>
      <Example caption={`${l.removed} — ${l[scheme]}`}>
        <SentFeedbackGroup
          title={l.openTitle}
          subtitle="Papi Jean"
          open={{ label: l.openCorner, spokenLabel: l.openCornerNamed, onPress: noop }}
        >
          <SentFeedbackMessage
            outcome={{ value: 'partly', label: l.partly, spokenLabel: l.spokenPartly }}
            at="2026-11-14T09:00:00.000Z"
            now={NOW}
            text={l.feedback}
            capture={null}
            note={l.removedNote}
            {...deleting(l.feedback)}
          />
        </SentFeedbackGroup>
      </Example>
    </Stack>
  )
}

export function MyFeedbackCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Cards l={l} scheme={scheme} />
        </ThemeProvider>
      ))}
    </Stack>
  )
}
