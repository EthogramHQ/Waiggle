// La section « Les mentions et le champ qui grandit » du catalogue (R5b) : les pièces des
// commentaires qui parlent des membres et du texte qu'on écrit, dans leurs états.
// - `MentionText` : un texte sans mention, une pastille « @Inès Morel » au nom actuel du membre, la
//   même mention deux fois, un pseudo que l'API n'a pas reconnu (resté du texte), un nom long qui
//   passe à la ligne.
// - `MentionField` : la liste sous le champ (par défaut), au-dessus avec son titre (la feuille des
//   commentaires), les lettres tapées en gras (« @Le » trouve Léa par son nom et Hugo par un mot du
//   sien), une réponse en retard qui ne s'ouvre pas ; un champ où l'on peut taper, qui cherche dans
//   des membres simulés.
// - `TextField compact` : une ligne de haut, puis trois lignes, puis plus de cinq (il s'arrête et
//   défile) ; le compteur sous le champ, absent à 899, « 900 / 1000 » à 900, rouge à 1001.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (plusieurs personnes écrivent le
// catalogue en même temps). Ses exemples, un outil de développement absent de l'appli publiée, sont
// écrits ici en français et en anglais. Le jour et la nuit se voient sur les captures du catalogue,
// prises dans les deux thèmes.
import { foldForSearch, type Mention } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MentionField, type MentionSuggestion } from '../ui/MentionField'
import { MentionText } from '../ui/MentionText'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Les mentions et le champ qui grandit (R5b)',
  textNone: 'Un texte sans mention : rien ne change, même un « @pseudo » écrit.',
  textPill:
    'Une mention reconnue par l’API : une pastille au nom actuel du membre, lue « Inès Morel, ouvre son profil ».',
  textTwice: 'La même mention deux fois, et un pseudo inconnu, resté du texte.',
  textLong: 'Un nom long en fin de ligne : la pastille passe à la ligne avec la phrase.',
  fieldBelow: 'La liste sous le champ (par défaut), le premier membre en surbrillance.',
  fieldAbove:
    'Au-dessus du champ, avec son titre, comme dans la feuille des commentaires ; les lettres tapées en gras (« @Le » : Léa par son nom, Hugo par un mot du sien).',
  fieldStale:
    'Une réponse en retard : les membres trouvés pour « in » ne s’ouvrent pas pour « ine ».',
  fieldTry: 'À essayer : tape « @le », « @in » ou « @mo ».',
  compactOne: 'Le champ compact, vide : une ligne de haut.',
  compactThree: 'Trois lignes : il grandit avec son texte.',
  compactMany: 'Huit lignes : il s’arrête à cinq, et son texte défile.',
  counter899: 'Le compteur sous le champ : absent à 899 caractères…',
  counter900: '… « 900 / 1000 » à 900…',
  counter1001: '… et rouge au-delà de 1 000.',
  field: 'Écrire un commentaire',
  list: 'Membres à mentionner',
  mentionTitle: 'Mentionner quelqu’un',
  plain: 'Bravo pour la démo ! @ines_morel m’en avait parlé.',
  pill: 'Demande à @ines_morel, elle sait comment régler la planète.',
  twice: '@ines_morel, tu as vu ? @zoe_martin aussi, et encore @ines_morel.',
  long: 'Merci pour le retour, la nouvelle version vient de @hugo_l',
  typedBelow: 'Merci @in',
  typedAbove: 'Merci @Le',
  typedStale: 'Bravo @ine',
  three: 'Bravo pour la démo !\nLe quiz marche bien.\nUne idée : un niveau de plus ?',
  many: 'Une\ndeux\ntrois\nquatre\ncinq\nsix\nsept\nhuit',
}

const en: typeof fr = {
  title: 'Mentions and the growing field (R5b)',
  textNone: 'A text without mentions: nothing changes, even a typed “@handle”.',
  textPill:
    'A mention the API recognised: a pill with the member’s current name, read “Inès Morel, opens their profile”.',
  textTwice: 'The same mention twice, and an unknown handle, left as text.',
  textLong: 'A long name at the end of a line: the pill wraps with the sentence.',
  fieldBelow: 'The list under the field (by default), the first member highlighted.',
  fieldAbove:
    'Above the field, with its title, as in the comments sheet; the typed letters in bold (“@Le”: Léa by her name, Hugo by a word of his).',
  fieldStale: 'A late answer: the members found for “in” do not open for “ine”.',
  fieldTry: 'Try it: type “@le”, “@in” or “@mo”.',
  compactOne: 'The compact field, empty: one line high.',
  compactThree: 'Three lines: it grows with its text.',
  compactMany: 'Eight lines: it stops at five, and its text scrolls.',
  counter899: 'The counter under the field: absent at 899 characters…',
  counter900: '… “900 / 1000” at 900…',
  counter1001: '… and red past 1,000.',
  field: 'Write a comment',
  list: 'Members to mention',
  mentionTitle: 'Mention someone',
  plain: 'Great demo! @ines_morel told me about it.',
  pill: 'Ask @ines_morel, she knows how to tune the planet.',
  twice: '@ines_morel, did you see? @zoe_martin too, and @ines_morel again.',
  long: 'Thanks for the feedback, the new version comes from @hugo_l',
  typedBelow: 'Thanks @in',
  typedAbove: 'Thanks @Le',
  typedStale: 'Well done @ine',
  three: 'Great demo!\nThe quiz works well.\nAn idea: one more level?',
  many: 'One\ntwo\nthree\nfour\nfive\nsix\nseven\neight',
}

/** Les membres simulés : de quoi trouver par le pseudo, par le nom, ou par un mot du nom. */
const members: MentionSuggestion[] = [
  { id: 'u5', name: 'Inès Morel', handle: 'ines_morel', avatar: null },
  { id: 'u6', name: 'Iniko Diallo', handle: 'iniko', avatar: null },
  { id: 'u1', name: 'Léa Moreau', handle: 'lea_moreau', avatar: null },
  { id: 'u7', name: 'Hugo Lefèvre-Delacroix de Montmorency', handle: 'hugo_l', avatar: null },
]

/** Les mentions que l'API rendrait avec ces textes : le pseudo écrit, le membre, son nom actuel. */
const mentions: Mention[] = [
  { handle: 'ines_morel', memberId: 'u5', name: 'Inès Morel' },
  { handle: 'hugo_l', memberId: 'u7', name: 'Hugo Lefèvre-Delacroix de Montmorency' },
]

/**
 * La recherche de l'API, simulée : un membre est trouvé si son pseudo, son nom ou un mot de son nom
 * (après une espace, un tiret ou une apostrophe) commence par ce qui est tapé, replié.
 */
const search = (query: string) =>
  members.filter((member) => {
    const name = foldForSearch(member.name)
    return (
      member.handle.startsWith(query) ||
      name.startsWith(query) ||
      [' ', '-', '’', "'"].some((before) => name.includes(`${before}${query}`))
    )
  })

/** Le champ d'un commentaire, son texte gardé ici ; `stale` : la réponse reste celle de « in ». */
function FieldSample({
  label,
  list,
  initial,
  placement,
  title,
  stale = false,
}: {
  label: string
  list: string
  initial: string
  placement?: 'above' | 'below'
  title?: string
  stale?: boolean
}) {
  const [value, setValue] = useState(initial)
  const [query, setQuery] = useState<string | null>(null)
  // Une réponse en retard : les membres de « in », quoi qu'on tape.
  const answeredFor = stale ? 'in' : query
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <MentionField
        label={label}
        value={value}
        onChangeText={setValue}
        suggestions={answeredFor === null ? [] : search(answeredFor)}
        suggestionsFor={answeredFor}
        suggestionsLabel={list}
        onQueryChange={setQuery}
        multiline
        {...(placement ? { suggestionsPlacement: placement } : null)}
        {...(title ? { suggestionsTitle: title } : null)}
      />
    </Surface>
  )
}

/** Le champ compact qui grandit, son texte gardé ici. */
function CompactSample({ label, initial }: { label: string; initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <TextField
      label={label}
      placeholder={label}
      value={value}
      onChangeText={setValue}
      compact
      multiline
      maxLines={5}
    />
  )
}

/** Un champ limité à 1 000 caractères, au compteur dû à partir de 900. */
function CounterSample({ label, length }: { label: string; length: number }) {
  const [value, setValue] = useState('a'.repeat(length))
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={setValue}
      multiline
      limit={1000}
      countFrom={900}
    />
  )
}

export function CommentMentionsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const open = () => {}

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.textNone}</Text>
      <MentionText text={l.plain} mentions={[]} onMemberPress={open} />

      <Text tone="secondary">{l.textPill}</Text>
      <MentionText text={l.pill} mentions={mentions} onMemberPress={open} />

      <Text tone="secondary">{l.textTwice}</Text>
      <MentionText text={l.twice} mentions={mentions} onMemberPress={open} />

      <Text tone="secondary">{l.textLong}</Text>
      <MentionText text={l.long} mentions={mentions} onMemberPress={open} />

      <Text tone="secondary">{l.fieldBelow}</Text>
      <FieldSample label={l.field} list={l.list} initial={l.typedBelow} />

      <Text tone="secondary">{l.fieldAbove}</Text>
      <FieldSample
        label={l.field}
        list={l.list}
        initial={l.typedAbove}
        placement="above"
        title={l.mentionTitle}
      />

      <Text tone="secondary">{l.fieldStale}</Text>
      <FieldSample label={l.field} list={l.list} initial={l.typedStale} stale />

      <Text tone="secondary">{l.fieldTry}</Text>
      <FieldSample
        label={l.field}
        list={l.list}
        initial=""
        placement="above"
        title={l.mentionTitle}
      />

      <Text tone="secondary">{l.compactOne}</Text>
      <CompactSample label={l.field} initial="" />

      <Text tone="secondary">{l.compactThree}</Text>
      <CompactSample label={l.field} initial={l.three} />

      <Text tone="secondary">{l.compactMany}</Text>
      <CompactSample label={l.field} initial={l.many} />

      <Text tone="secondary">{l.counter899}</Text>
      <CounterSample label={l.field} length={899} />

      <Text tone="secondary">{l.counter900}</Text>
      <CounterSample label={l.field} length={900} />

      <Text tone="secondary">{l.counter1001}</Text>
      <CounterSample label={l.field} length={1001} />
    </Stack>
  )
}
