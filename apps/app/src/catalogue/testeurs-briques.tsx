// La section « Le coin des testeurs : les briques » du catalogue (R7b) : ce dont le fil d'un testeur
// a besoin avant ses écrans.
// - `OutcomePill`, l'issue d'un retour (« Oui », « En partie », « Non »), dans ses trois issues, sur
//   la bulle d'un testeur et sur celle de l'auteur ;
// - `CommentComposer` en champ de réponse d'un fil : son exemple « Répondre à Inès », le nom lu
//   « Envoyer la réponse », sans mentions ni photo ; vide, avec un texte, en cours d'envoi, dans la
//   feuille d'un téléphone et dans la colonne d'un ordinateur.
// De jour et de nuit. Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs
// personnes y travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import { radii, space } from '@ruche/brand'
import type { FeedbackOutcome } from '@ruche/contracts'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { CommentComposer } from '../ui/CommentComposer'
import { OutcomePill } from '../ui/OutcomePill'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import type { TextFieldInput } from '../ui/TextField'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le coin des testeurs : les briques',
  intro:
    'L’issue d’un retour se lit d’un coup d’œil : une pastille avec son icône (coche, demi-cercle, croix) et son libellé, jamais la couleur seule. Le lecteur d’écran entend « Ça a marché : Oui ». Le champ des commentaires sert aussi à répondre dans un fil : sans mentions (un fil se lit à deux) et sans photo.',
  outcomesTitle: 'L’issue d’un retour',
  onTester: 'Sur la bulle du testeur',
  onAuthor: 'Sur la crème de l’auteur',
  composerTitle: 'Répondre dans un fil',
  empty: 'Vide : « Envoyer » inactif',
  text: 'Avec un texte',
  sending: 'Envoi en cours',
  failed: 'Envoi raté',
  retry: 'Réessayer',
  phone: 'feuille du téléphone',
  computer: 'colonne de l’ordinateur',
  name: 'Inès',
  sample: 'Merci Inès ! Je regarde le niveau 3 ce soir.',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The testers corner: building blocks',
  intro:
    'The outcome of a feedback reads at a glance: a pill with its icon (check, half circle, cross) and its label, never the colour alone. A screen reader hears “Did it work: Yes”. The comment field also answers in a thread: without mentions (a thread is read by two) and without a photo.',
  outcomesTitle: 'The outcome of a feedback',
  onTester: 'On the tester’s bubble',
  onAuthor: 'On the author’s cream',
  composerTitle: 'Answering in a thread',
  empty: 'Empty: “Send” inactive',
  text: 'With some text',
  sending: 'Sending',
  failed: 'Sending failed',
  retry: 'Try again',
  phone: 'phone sheet',
  computer: 'computer column',
  name: 'Inès',
  sample: 'Thanks Inès! I’ll look at level 3 tonight.',
  day: 'day',
  night: 'night',
}

type Labels = typeof fr
const noop = () => {}
const schemes = ['day', 'night'] as const
const outcomes: readonly FeedbackOutcome[] = ['yes', 'partly', 'no']

/** Un exemple légendé (« Sur la bulle du testeur — nuit »). */
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

/**
 * Un fond de bulle, en attendant le composant de la bulle (un autre lot de la tranche) : la couleur
 * de son rôle, bordée comme la carte. Le catalogue, outil de développement, peut lire les couleurs.
 */
function Bubble({ of, children }: { of: 'bubbleTester' | 'bubbleAuthor'; children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        backgroundColor: colors[of],
        borderColor: colors.line,
        borderWidth: of === 'bubbleTester' ? 1 : 0,
        borderRadius: radii.group,
        padding: space.md,
      }}
    >
      {children}
    </View>
  )
}

/** Les trois issues côte à côte, nommées comme dans un fil (« Ça a marché : Oui »). */
function Outcomes() {
  const { t } = useTranslation()
  return (
    <Stack direction="row" gap="sm" wrap>
      {outcomes.map((outcome) => {
        const label = t(($) => $.project.testers.feedback.outcomes[outcome])
        return (
          <OutcomePill
            key={outcome}
            outcome={outcome}
            label={label}
            spokenLabel={t(($) => $.project.testers.feedback.outcomeSpoken, { outcome: label })}
          />
        )
      })}
    </Stack>
  )
}

type ReplySample = {
  place: 'sheet' | 'column'
  initial: string
  pending?: boolean
  error?: string
}

/** Le champ de réponse d'un fil : le texte gardé ici, sans mentions ni photo. */
function Reply({ place, initial, pending = false, error }: ReplySample) {
  const { t, i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const [value, setValue] = useState(initial)
  const input = useRef<TextFieldInput>(null)
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <CommentComposer
        value={value}
        onChangeText={setValue}
        onSend={() => setValue('')}
        pending={pending}
        error={error}
        errorAction={error ? { label: l.retry, onPress: noop } : undefined}
        banner={null}
        onCancelBanner={noop}
        caption={t(($) => $.project.testers.thread.privacyAuthor, { name: l.name })}
        place={place}
        mentions={false}
        placeholder={t(($) => $.project.testers.thread.replyPlaceholder, { name: l.name })}
        sendLabel={t(($) => $.project.testers.thread.replyLabel)}
        inputRef={input}
      />
    </Surface>
  )
}

export function TesterBricksCatalogue() {
  const { t, i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const replyError = t(($) => $.project.testers.thread.replyError)
  const states: { id: string; label: string; sample: Omit<ReplySample, 'place'> }[] = [
    { id: 'empty', label: l.empty, sample: { initial: '' } },
    { id: 'text', label: l.text, sample: { initial: l.sample } },
    { id: 'sending', label: l.sending, sample: { initial: l.sample, pending: true } },
    { id: 'failed', label: l.failed, sample: { initial: l.sample, error: replyError } },
  ]
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      <Text variant="headline" heading={3}>
        {l.outcomesTitle}
      </Text>
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.onTester} — ${l[scheme]}`}>
              <Bubble of="bubbleTester">
                <Outcomes />
              </Bubble>
            </Example>
            <Example caption={`${l.onAuthor} — ${l[scheme]}`}>
              <Bubble of="bubbleAuthor">
                <Outcomes />
              </Bubble>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}

      <Text variant="headline" heading={3}>
        {l.composerTitle}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            {(['sheet', 'column'] as const).map((place) =>
              states
                // La nuit, les deux états qui montrent le plus : un texte, et l'erreur.
                .filter((state) => scheme === 'day' || state.id === 'text' || state.id === 'failed')
                .map((state) => (
                  <Example
                    key={`${place}-${state.id}`}
                    caption={`${state.label} — ${place === 'sheet' ? l.phone : l.computer} — ${l[scheme]}`}
                  >
                    <Reply place={place} {...state.sample} />
                  </Example>
                )),
            )}
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
