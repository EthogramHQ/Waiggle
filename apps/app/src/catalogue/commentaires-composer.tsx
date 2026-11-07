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
import { View } from 'react-native'
import { CommentComposer } from '../ui/CommentComposer'
import { MentionField, type MentionSuggestion } from '../ui/MentionField'
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
  replyExcerpt:
    'En réponse, dans la colonne : le bandeau rappelle le début du commentaire visé (`banner.excerpt`).',
  excerpt: 'Super idée, je l’ai testé ce matin avec ma fille : elle a adoré le quiz.',
  narrow:
    'Dans une colonne étroite (300 points) : « Envoyer » passe sous le champ, à droite, au lieu de le serrer.',
  limited:
    'La liste des membres limitée en hauteur (`suggestionsMaxHeight`, fenêtre basse) : elle défile, le nom et le pseudo restent l’un sous l’autre.',
  limitedField: 'Écrire un commentaire',
  limitedList: 'Membres à mentionner',
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
  replyExcerpt:
    'Replying, in the column: the banner recalls the start of the targeted comment (`banner.excerpt`).',
  excerpt: 'Great idea, I tried it this morning with my daughter: she loved the quiz.',
  narrow:
    'In a narrow column (300 points): “Send” goes under the field, on the right, instead of squeezing it.',
  limited:
    'The member list limited in height (`suggestionsMaxHeight`, low window): it scrolls, the name and the handle stay one under the other.',
  limitedField: 'Write a comment',
  limitedList: 'Members to mention',
}

/** La largeur de la colonne étroite : la rangée du champ n'y tient plus d'une ligne. */
const NARROW = 300

/** Les membres simulés que la recherche « in » trouve. */
const members: MentionSuggestion[] = [
  { id: 'u5', name: 'Inès Morel', handle: 'ines_morel', avatar: null },
  { id: 'u6', name: 'Iniko Diallo', handle: 'iniko', avatar: null },
]

/** Cinq membres que « in » trouve, dont un au nom long : de quoi remplir une liste limitée. */
const manyMembers: MentionSuggestion[] = [
  ...members,
  { id: 'u8', name: 'Inaya Benali', handle: 'inaya', avatar: null },
  { id: 'u9', name: 'Ingrid Hansen-Delacroix de Montmorency', handle: 'ingrid_h', avatar: null },
  { id: 'u10', name: 'Inigo Montoya', handle: 'inigo', avatar: null },
]

/**
 * Un champ dont la liste de membres a une hauteur limitée, comme dans la feuille d'une fenêtre
 * basse (le champ de la feuille calcule cette hauteur d'après la fenêtre) : la liste défile.
 */
function LimitedList({ field, list }: { field: string; list: string }) {
  const [value, setValue] = useState('Merci @in')
  const [query, setQuery] = useState<string | null>(null)
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <MentionField
        label={field}
        value={value}
        onChangeText={setValue}
        suggestions={query === 'in' ? manyMembers : []}
        suggestionsFor={query}
        suggestionsLabel={list}
        suggestionsPlacement="above"
        suggestionsMaxHeight={LIMITED_HEIGHT}
        onQueryChange={setQuery}
        multiline
      />
    </Surface>
  )
}

/** La hauteur de la liste limitée : un peu plus de deux choix de 44 points. */
const LIMITED_HEIGHT = 110

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

      {/* Les états qui ne tiennent pas dans la boucle ci-dessus : le rappel du commentaire visé (la
          colonne seule en a besoin), la colonne étroite, la liste de membres limitée en hauteur. */}
      <Stack gap="sm">
        <Text tone="secondary">{l.replyExcerpt}</Text>
        <Composer
          {...none}
          initial=""
          caption={replyHint}
          banner={{ kind: 'reply', name: l.replyTo, excerpt: l.excerpt }}
          place="column"
        />
      </Stack>
      <Stack gap="sm">
        <Text tone="secondary">{l.narrow}</Text>
        <View style={{ width: NARROW, maxWidth: '100%' }}>
          <Composer {...none} initial={l.sample} place="column" />
        </View>
      </Stack>
      <Stack gap="sm">
        <Text tone="secondary">{l.limited}</Text>
        <LimitedList field={l.limitedField} list={l.limitedList} />
      </Stack>
    </Stack>
  )
}
