// La section « Mes commentaires : lignes » du catalogue (tranche R11, planche R11-Mes-Commentaires) :
// la ligne d'un de ses commentaires (`MyCommentRow`) dans tous ses états, de jour puis de nuit :
// commentaire, réponse, projet qui n'est plus visible (texte entier, rien à ouvrir), masqué par
// l'auteur du projet, retiré par la modération, texte long coupé à deux lignes, et à 320 points.
// Outil de développement : les exemples sont écrits ici ; les libellés des lignes viennent des
// traductions, comme dans l'appli.
import { radii, space } from '@ruche/brand'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { excerpt } from '../ui/CommentAction'
import { ListGroup } from '../ui/ListGroup'
import { type MyCommentMark, MyCommentRow } from '../ui/MyCommentRow'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Mes commentaires : lignes',
  intro:
    'Une ligne de « Mes commentaires » : le lien vers le commentaire (projet, date, « Réponse », début du texte) et « Supprimer » à part, nommé par son extrait. Toucher une ligne l’écrit ici.',
  day: 'jour',
  night: 'nuit',
  rows: 'Commentaire, réponse, projet qui n’est plus visible, masqué, retiré, texte long',
  narrow: 'À 320 points',
  touched: 'Dernier geste : {{what}}',
  long: 'J’ai essayé avec les photos du mariage de ma cousine, et il a reconnu chaque invité, même les enfants cachés derrière la pièce montée. Seul bémol : il appelle tous les chiens « Médor ».',
}

const en: typeof fr = {
  title: 'My comments: rows',
  intro:
    'A row of “My comments”: the link to the comment (project, date, “Reply”, start of the text) and a separate “Delete”, named by its excerpt. Touching a row writes it here.',
  day: 'day',
  night: 'night',
  rows: 'Comment, reply, project no longer visible, hidden, removed, long text',
  narrow: 'At 320 points',
  touched: 'Last gesture: {{what}}',
  long: 'I tried it with the photos of my cousin’s wedding, and it recognised every guest, even the children hiding behind the wedding cake. One downside: it calls every dog “Rex”.',
}

type Labels = typeof fr

const schemes = ['day', 'night'] as const

/** Des dates fixes : les captures ne changent pas d'un passage à l'autre (sauf « il y a »). */
const DATES = [
  '2026-11-14T18:00:00.000Z',
  '2026-11-13T09:30:00.000Z',
  '2026-11-10T20:15:00.000Z',
  '2026-11-03T12:00:00.000Z',
]

type Sample = {
  id: string
  title: string | null
  body: string
  reply?: boolean
  marks?: ('hidden' | 'removed')[]
  date: string
}

const samplesOf = (l: Labels): Sample[] => [
  {
    id: 'one',
    title: 'Décollage !',
    body: 'Yanis a eu 9 sur 10, il réclame déjà une question sur les trous noirs.',
    date: DATES[0] ?? '',
  },
  {
    id: 'reply',
    title: 'Carnet de cafés',
    body: 'Moi aussi, il a deviné mon café du Pérou du premier coup.',
    reply: true,
    date: DATES[1] ?? '',
  },
  {
    id: 'gone',
    title: null,
    body: l.long,
    date: DATES[2] ?? '',
  },
  {
    id: 'hidden',
    title: 'Quel papillon ?',
    body: 'Il a reconnu un paon du jour dans le jardin de ma grand-mère.',
    marks: ['hidden'],
    date: DATES[3] ?? '',
  },
  {
    id: 'removed',
    title: 'Raconte-moi un tableau',
    body: 'Un avis tranché sur la peinture moderne.',
    marks: ['removed'],
    date: DATES[3] ?? '',
  },
  { id: 'long', title: 'Le jardin qui parle', body: l.long, date: DATES[3] ?? '' },
]

/** Un exemple légendé, sur le fond de la page (jour ou nuit), à 390 ou 320 points. */
function Example({
  caption,
  narrow = false,
  children,
}: {
  caption: string
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
          padding: space.lg,
          borderRadius: radii.group,
          backgroundColor: colors.background,
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

function Rows({ samples, onTouch }: { samples: Sample[]; onTouch: (what: string) => void }) {
  const { t } = useTranslation()
  const marksOf = (sample: Sample): MyCommentMark[] =>
    (sample.marks ?? []).map((mark) =>
      mark === 'hidden'
        ? { icon: 'eye-slash', label: t(($) => $.project.comments.hiddenByAuthor) }
        : { icon: 'shield-check', label: t(($) => $.project.comments.removedPlaceholder) },
    )
  return (
    <ListGroup list>
      {samples.map((sample) => {
        const short = excerpt(sample.body)
        const title = sample.title
        return (
          <MyCommentRow
            key={sample.id}
            projectTitle={title}
            goneLabel={t(($) => $.myComments.projectGone)}
            date={sample.date}
            replyLabel={sample.reply ? t(($) => $.myComments.reply) : undefined}
            body={sample.body}
            marks={marksOf(sample)}
            {...(title === null
              ? null
              : {
                  openLabel: t(($) => $.myComments.open, { title, excerpt: short }),
                  onOpen: () => onTouch(title),
                })}
            deleteText={t(($) => $.myComments.delete)}
            deleteLabel={t(($) => $.myComments.deleteNamed, { excerpt: short })}
            onDelete={() => onTouch(t(($) => $.myComments.deleteNamed, { excerpt: short }))}
          />
        )
      })}
    </ListGroup>
  )
}

export function MyCommentsCatalogue() {
  const { i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const [touched, setTouched] = useState<string | null>(null)
  const samples = samplesOf(l)
  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      {touched ? <Text tone="secondary">{l.touched.replace('{{what}}', touched)}</Text> : null}
      {schemes.map((scheme) => (
        // Un thème imposé autour des exemples : le jour, puis la nuit.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.rows} — ${l[scheme]}`}>
              <Rows samples={samples} onTouch={setTouched} />
            </Example>
            <Example caption={`${l.narrow} — ${l[scheme]}`} narrow>
              <Rows samples={samples.slice(0, 3)} onTouch={setTouched} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}
