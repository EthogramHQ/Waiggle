// La section « Le coin des testeurs : le fil » du catalogue (R7b) : les deux briques du fil de
// retours, de jour et de nuit.
// - `MessageBubble` : un retour du testeur (son issue, l'appareil, une capture), réglé ou non, sans
//   texte, retiré par la modération ; la réponse de l'auteur, vue par lui (« Ta réponse ») et par le
//   testeur. La couleur suit le rôle de qui écrit, jamais celui qui lit.
// - `ThreadRow` : une ligne de la liste des fils de l'auteur, non lue, lue (« Toi : … »), d'un
//   testeur parti (« Ne teste plus »), sans texte, et choisie (le fil ouvert à côté, sur ordinateur).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli. Les
// dates sont fixes (le 3 et le 10 novembre 2026) : le catalogue pré-rendu ne lit pas l'heure.
import { palettes, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ListGroup } from '../ui/ListGroup'
import { type ActionMenuItem, MessageBubble } from '../ui/MessageBubble'
import { Notice } from '../ui/Notice'
import { RemovalNotice } from '../ui/RemovalNotice'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThreadRow } from '../ui/ThreadRow'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { useNameOf } from '../useNameOf'

const fr = {
  title: 'Le coin des testeurs : le fil',
  intro:
    'Dans un fil, la couleur suit qui écrit : l’auteur du projet en crème miel, à droite ; le testeur en blanc, à gauche, quel que soit celui qui lit. Chaque message est un élément de liste nommé « Retour d’Inès, il y a 3 h ». La liste des fils, pour l’auteur : un point miel cerclé d’ambre et du gras pour un fil non lu, lu « Inès Haddad, non lu ».',
  bubblesTitle: 'Les messages d’un fil',
  rowsTitle: 'La liste des fils',
  feedback: 'Retour du testeur, avec capture',
  settled: 'Retour réglé',
  noText: 'Retour sans texte',
  removed: 'Retiré par la modération (vu par le testeur)',
  replyMine: 'Réponse de l’auteur, vue par lui',
  replyTheirs: 'Réponse de l’auteur, vue par le testeur',
  mineFeedback: 'Son propre retour, vu par le testeur',
  rows: 'Non lu, lu (« Toi : »), sans texte, ne teste plus',
  current: 'Choisie : le fil ouvert à côté (ordinateur)',
  ines: 'Inès Haddad',
  lea: 'Léa Moreau',
  hugo: 'Hugo Lefèvre',
  nora: 'Nora Benali',
  jean: 'Papi Jean',
  partly: 'le score repart à zéro au niveau 3',
  no: 'La page reste blanche après la dernière question.',
  reply: 'Merci Inès ! Je regarde le niveau 3 ce soir.',
  rowLea: 'Au niveau 2, le quiz se fige si on répond trop vite.',
  rowInes: 'Merci Inès, je regarde le niveau 3 ce soir.',
  rowHugo: 'Le quiz ne s’ouvre pas sur mon vieux téléphone.',
  settledIn: 'v1.3',
  removedTitle: 'Retiré par la modération',
  removedLine: 'Ce message n’est plus visible pour Papi Jean.',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The testers corner: the thread',
  intro:
    'In a thread, the colour follows who writes: the project’s author in honey cream, on the right; the tester in white, on the left, whoever reads. Each message is a list item named “Feedback from Inès, 3 h ago”. The list of threads, for the author: a honey dot ringed with amber and bold text for an unread thread, read “Inès Haddad, unread”.',
  bubblesTitle: 'The messages of a thread',
  rowsTitle: 'The list of threads',
  feedback: 'Tester’s feedback, with a screenshot',
  settled: 'Settled feedback',
  noText: 'Feedback without text',
  removed: 'Removed by moderation (seen by the tester)',
  replyMine: 'Author’s answer, seen by them',
  replyTheirs: 'Author’s answer, seen by the tester',
  mineFeedback: 'Own feedback, seen by the tester',
  rows: 'Unread, read (“You:”), without text, no longer testing',
  current: 'Chosen: the thread open alongside (computer)',
  ines: 'Inès Haddad',
  lea: 'Léa Moreau',
  hugo: 'Hugo Lefèvre',
  nora: 'Nora Benali',
  jean: 'Grandpa Jean',
  partly: 'the score resets at level 3',
  no: 'The page stays blank after the last question.',
  reply: 'Thanks Inès! I’ll look at level 3 tonight.',
  rowLea: 'At level 2, the quiz freezes if you answer too fast.',
  rowInes: 'Thanks Inès, I’ll look at level 3 tonight.',
  rowHugo: 'The quiz won’t open on my old phone.',
  settledIn: 'v1.3',
  removedTitle: 'Removed by moderation',
  removedLine: 'This message is no longer visible to Grandpa Jean.',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const

/** Des dates fixes : le 3 novembre 2026 au matin, puis le 10 novembre au soir. */
const EARLIER = '2026-11-03T09:10:00.000Z'
const LATER = '2026-11-10T18:05:00.000Z'

/**
 * Une capture d'écran d'exemple : un dessin SVG en adresse `data:` (expo-image le dessine aussi sur
 * le web), sans photo à télécharger.
 */
// Les couleurs viennent de @ruche/brand (palette de jour : une image ne change pas avec le thème).
const day = palettes.day
const CAPTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 104"><rect width="150" height="104" fill="${day.text}"/><circle cx="112" cy="30" r="14" fill="${day.honey}"/><rect x="16" y="64" width="80" height="10" rx="5" fill="${day.background}"/><rect x="16" y="82" width="52" height="8" rx="4" fill="${day.textMuted}"/></svg>`
const capture = { uri: `data:image/svg+xml;utf8,${encodeURIComponent(CAPTURE_SVG)}` }

/** Un exemple légendé (« Retour réglé — nuit »). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      {children}
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
    </Stack>
  )
}

/** Les messages d'un fil, dans une colonne de téléphone (390 points moins ses marges). */
function Bubbles({ l, scheme }: { l: Labels; scheme: (typeof schemes)[number] }) {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  const outcome = (value: 'yes' | 'partly' | 'no') => ({
    value,
    label: t(($) => $.project.testers.feedback.outcomes[value]),
  })
  const device = (value: 'phone' | 'computer' | 'tablet') =>
    t(($) => $.project.testers.feedback.devices[value])
  const settle: ActionMenuItem = {
    label: t(($) => $.project.testers.thread.settle),
    icon: 'check-circle',
    onPress: noop,
  }
  const unsettle: ActionMenuItem = { ...settle, label: t(($) => $.project.testers.thread.unsettle) }
  const report: ActionMenuItem = {
    label: t(($) => $.project.testers.thread.report),
    icon: 'flag',
    onPress: noop,
  }
  const menu = [settle, report]
  const own = [
    {
      label: t(($) => $.project.testers.thread.delete),
      icon: 'trash' as const,
      tone: 'danger' as const,
      onPress: noop,
    },
  ]
  const at = (caption: string) => `${caption} — ${l[scheme]}`
  return (
    <Surface variant="grouped" padding="lg" gap="lg">
      {/* Une vraie liste, comme dans l'écran du fil : chaque message en est un élément. */}
      <View role="list" style={{ gap: space.lg, maxWidth: 420 }}>
        <Example caption={at(l.feedback)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine={false}
            name={l.ines}
            text={l.partly}
            at={LATER}
            outcome={outcome('partly')}
            device={device('phone')}
            deviceKind="phone"
            capture={{
              source: capture,
              description: t(($) => $.project.testers.feedback.captureName, {
                nameOf: nameOf(l.ines),
              }),
            }}
            menu={menu}
          />
        </Example>
        <Example caption={at(l.settled)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine={false}
            name={l.ines}
            text={l.no}
            at={EARLIER}
            outcome={outcome('no')}
            device={device('computer')}
            deviceKind="computer"
            settled={t(($) => $.project.testers.thread.settledIn, { version: l.settledIn })}
            menu={[unsettle, report]}
          />
        </Example>
        <Example caption={at(l.replyMine)}>
          <MessageBubble
            from="author"
            kind="reply"
            mine
            name={l.jean}
            text={l.reply}
            at={LATER}
            menu={own}
          />
        </Example>
        <Example caption={at(l.replyTheirs)}>
          <MessageBubble
            from="author"
            kind="reply"
            mine={false}
            name={l.jean}
            text={l.reply}
            at={LATER}
            menu={[report]}
          />
        </Example>
        <Example caption={at(l.noText)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine
            name={l.ines}
            text={null}
            at={EARLIER}
            outcome={outcome('yes')}
            device={device('tablet')}
            deviceKind="tablet"
            menu={own}
          />
        </Example>
        <Example caption={at(l.removed)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine
            name={l.ines}
            text={l.partly}
            at={EARLIER}
            outcome={outcome('partly')}
            removal={<RemovalNotice title={l.removedTitle} lines={[l.removedLine]} compact />}
            menu={own}
          />
        </Example>
        <Example caption={at(l.mineFeedback)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine
            name={l.ines}
            text={l.partly}
            at={LATER}
            outcome={outcome('partly')}
            device={device('phone')}
            settled={t(($) => $.project.testers.thread.settled)}
            menu={own}
          />
        </Example>
        {/* R7b, K13 : « Marquer comme réglé » en route, puis refusé, sous la bulle touchée. */}
        <Example caption={at(`${l.feedback} · réglage en cours (K13)`)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine={false}
            name={l.ines}
            text={l.partly}
            at={LATER}
            outcome={outcome('partly')}
            settled={t(($) => $.project.testers.thread.settled)}
            pending={t(($) => $.project.testers.thread.settling)}
            menu={own}
          />
        </Example>
        <Example caption={at(`${l.feedback} · réglage refusé (K13)`)}>
          <MessageBubble
            from="tester"
            kind="feedback"
            mine={false}
            name={l.ines}
            text={l.partly}
            at={LATER}
            outcome={outcome('partly')}
            notice={<Notice message={t(($) => $.project.testers.thread.settleError)} />}
            menu={own}
          />
        </Example>
      </View>
    </Surface>
  )
}

/** La liste des fils de l'auteur, puis une ligne choisie (le fil ouvert à côté, sur ordinateur). */
function Rows({ l, scheme }: { l: Labels; scheme: (typeof schemes)[number] }) {
  return (
    <Stack gap="md">
      <Example caption={`${l.rows} — ${l[scheme]}`}>
        <ListGroup>
          <ThreadRow
            name={l.lea}
            avatar={null}
            lastAt={LATER}
            lastFrom="tester"
            excerpt={l.rowLea}
            unread
            former={false}
            onPress={noop}
          />
          <ThreadRow
            name={l.ines}
            avatar={null}
            lastAt={LATER}
            lastFrom="author"
            excerpt={l.rowInes}
            unread={false}
            former={false}
            onPress={noop}
          />
          <ThreadRow
            name={l.nora}
            avatar={null}
            lastAt={EARLIER}
            lastFrom="tester"
            excerpt={null}
            unread
            former={false}
            onPress={noop}
          />
          <ThreadRow
            name={l.hugo}
            avatar={null}
            lastAt={EARLIER}
            lastFrom="tester"
            excerpt={l.rowHugo}
            unread={false}
            former
            onPress={noop}
          />
        </ListGroup>
      </Example>
      <Example caption={`${l.current} — ${l[scheme]}`}>
        <ListGroup>
          <ThreadRow
            name={l.lea}
            avatar={null}
            lastAt={LATER}
            lastFrom="tester"
            excerpt={l.rowLea}
            unread
            former={false}
            onPress={noop}
          />
          <ThreadRow
            name={l.ines}
            avatar={null}
            lastAt={LATER}
            lastFrom="author"
            excerpt={l.rowInes}
            unread={false}
            former={false}
            current
            onPress={noop}
          />
        </ListGroup>
      </Example>
    </Stack>
  )
}

export function TesterThreadCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Text variant="headline" heading={3}>
        {l.bubblesTitle}
      </Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Bubbles l={l} scheme={scheme} />
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.rowsTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Rows l={l} scheme={scheme} />
        </ThemeProvider>
      ))}
    </Stack>
  )
}
