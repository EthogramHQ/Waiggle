// La section « Le champ des commentaires » du catalogue (R5b) : `CommentComposer` dans tous ses états,
// comme dans la feuille d'un téléphone (la flèche ronde) puis dans la colonne d'un ordinateur
// (« Envoyer » en texte) : vide, avec du texte, avec une liste de membres à mentionner, en réponse, en
// modification, avec le compteur, trop long, pendant l'envoi, et après une erreur.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (plusieurs personnes écrivent le
// catalogue en même temps). Ses exemples, un outil de développement absent de l'appli publiée, sont
// écrits ici en français et en anglais. Le jour et la nuit se voient sur les captures du catalogue,
// prises dans les deux thèmes.
import { type ComponentProps, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommentComposer } from '../ui/CommentComposer'
import type { MentionSuggestion } from '../ui/MentionField'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import type { TextFieldInput } from '../ui/TextField'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Le champ des commentaires (R5b)',
  sheet: 'Dans la feuille (téléphone) : la flèche ronde',
  column: 'Dans la colonne (ordinateur) : « Envoyer » en texte',
  empty: 'Vide : l’envoi est grisé et refusé.',
  text: 'Avec du texte : l’envoi est actif.',
  mention: 'Après « @in » : les membres à mentionner, au-dessus du champ.',
  reply: 'En réponse : le bandeau, le nom en gras, et sa croix.',
  edit: 'En modification : le bandeau, et sa croix.',
  counter: 'À 900 caractères : le compteur paraît sous le champ.',
  tooLong: 'À 1 003 caractères : le champ et le compteur en rouge, l’envoi refusé.',
  sending: 'Pendant l’envoi : le bouton occupé, le texte figé, la croix inactive.',
  failed: 'Après une erreur : le message au-dessus du champ, « Réessayer », et le texte gardé.',
  sample: 'Bravo pour la démo ! Le quiz marche bien.',
  long: 'Bravo pour la démo, le quiz marche bien chez nous. ',
  typing: 'Merci @in',
  member: 'Sam Petit',
  replyTo: 'Léa Moreau',
}

const en: typeof fr = {
  title: 'The comment field (R5b)',
  sheet: 'In the sheet (phone): the round arrow',
  column: 'In the column (computer): “Send” as text',
  empty: 'Empty: sending is greyed out and refused.',
  text: 'With some text: sending is active.',
  mention: 'After “@in”: the members to mention, above the field.',
  reply: 'Replying: the banner, the name in bold, and its cross.',
  edit: 'Editing: the banner, and its cross.',
  counter: 'At 900 characters: the counter appears under the field.',
  tooLong: 'At 1,003 characters: the field and the counter in red, sending refused.',
  sending: 'While sending: the button busy, the text frozen, the cross inactive.',
  failed: 'After an error: the message above the field, “Retry”, and the text kept.',
  sample: 'Great demo! The quiz works well.',
  long: 'Great demo, the quiz works well at home with the kids. ',
  typing: 'Thanks @in',
  member: 'Sam Petit',
  replyTo: 'Léa Moreau',
}

/** Les membres simulés que la recherche « in » trouve. */
const members: MentionSuggestion[] = [
  { id: 'u5', name: 'Inès Morel', handle: 'ines_morel', avatar: null },
  { id: 'u6', name: 'Iniko Diallo', handle: 'iniko', avatar: null },
]

/** Un texte fait de la même phrase, coupé à la longueur voulue. */
const textOf = (phrase: string, length: number) =>
  phrase.repeat(Math.ceil(length / phrase.length)).slice(0, length)

type Sample = Pick<
  ComponentProps<typeof CommentComposer>,
  'pending' | 'banner' | 'error' | 'errorAction' | 'place' | 'caption'
> & { initial: string }

/** Un champ du catalogue : le texte gardé ici, et la recherche de membres simulée. */
function Composer({ initial, ...sample }: Sample) {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [value, setValue] = useState(initial)
  const [query, setQuery] = useState<string | null>(null)
  const input = useRef<TextFieldInput>(null)
  const [banner, setBanner] = useState(sample.banner)
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <CommentComposer
        {...sample}
        value={value}
        onChangeText={setValue}
        onSend={() => setValue('')}
        banner={banner}
        onCancelBanner={() => setBanner(null)}
        avatar={null}
        memberName={l.member}
        suggestions={query === 'in' ? members : []}
        suggestionsFor={query}
        onQueryChange={setQuery}
        inputRef={input}
      />
    </Surface>
  )
}

export function CommentComposerCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const hint = t(($) => $.project.comments.hint)
  const replyHint = t(($) => $.project.comments.replyHint)
  const editHint = t(($) => $.project.comments.editHint)
  const none = { pending: false, banner: null, caption: hint }

  // Chaque état, avec ce qui le présente ; les mêmes dans la feuille et dans la colonne.
  const states: { id: string; label: string; sample: Omit<Sample, 'place'> }[] = [
    { id: 'empty', label: l.empty, sample: { ...none, initial: '' } },
    { id: 'text', label: l.text, sample: { ...none, initial: l.sample } },
    { id: 'mention', label: l.mention, sample: { ...none, initial: l.typing } },
    {
      id: 'reply',
      label: l.reply,
      sample: {
        ...none,
        initial: '',
        caption: replyHint,
        banner: { kind: 'reply', name: l.replyTo },
      },
    },
    {
      id: 'edit',
      label: l.edit,
      sample: { ...none, initial: l.sample, caption: editHint, banner: { kind: 'edit' } },
    },
    { id: 'counter', label: l.counter, sample: { ...none, initial: textOf(l.long, 900) } },
    { id: 'too-long', label: l.tooLong, sample: { ...none, initial: textOf(l.long, 1003) } },
    {
      id: 'sending',
      label: l.sending,
      sample: {
        ...none,
        initial: l.sample,
        pending: true,
        caption: replyHint,
        banner: { kind: 'reply', name: l.replyTo },
      },
    },
    {
      id: 'failed',
      label: l.failed,
      sample: {
        ...none,
        initial: l.sample,
        error: t(($) => $.project.comments.error),
        errorAction: { label: t(($) => $.common.retry), onPress: () => {} },
      },
    },
  ]
  const places = [
    { place: 'sheet' as const, heading: l.sheet },
    { place: 'column' as const, heading: l.column },
  ]

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      {places.map(({ place, heading }) => (
        <Stack key={place} gap="md">
          <Text variant="heading" heading={3}>
            {heading}
          </Text>
          {states.map(({ id, label, sample }) => (
            <Stack key={id} gap="sm">
              <Text tone="secondary">{label}</Text>
              <Composer {...sample} place={place} />
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
