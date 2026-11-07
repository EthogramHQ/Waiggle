// La section « Fil, aperçu et titre compté » du catalogue (R5b) : les trois morceaux de mise en
// page des commentaires, dans leurs états.
// - `CountedTitle` : « Mes projets · 3 » (le point insécable d'avant), « Projets · 50+ » au plafond,
//   « Commentaires 6 » (une espace ordinaire : le nombre passe à la ligne entier), le titre seul
//   avec 0, et le grand titre d'une feuille (`title2`).
// - `CommentThread` : une racine seule (aucun trait), une racine et deux réponses (le trait et ses
//   coudes), un emplacement « Commentaire supprimé » qui garde sa réponse, un fil avec un pied.
// - `CommentPreview` : « Voir les 6 commentaires », « Commenter », l'état vide et « Écrire un
//   commentaire », et sans bouton (sur ordinateur, 5 commentaires ou moins).
// Les cartes sont ici des lignes simples (une photo, un nom, un texte) : `CommentCard` s'écrit en
// même temps ailleurs, et le fil ne dépend que de la taille de ses photos (36 et 28 points).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (plusieurs personnes écrivent le
// catalogue en même temps). Ses exemples, un outil de développement absent de l'appli publiée, sont
// écrits ici en français et en anglais.
import type { CommentReply } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../ui/Avatar'
import { CommentCard } from '../ui/CommentCard'
import { CommentList } from '../ui/CommentList'
import { CommentPreview } from '../ui/CommentPreview'
import { CommentThread } from '../ui/CommentThread'
import { CountedTitle } from '../ui/CountedTitle'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Fil, aperçu et titre compté (R5b)',
  counted:
    'Le titre compté : le point insécable, le plafond « 50+ », l’espace ordinaire des commentaires, 0 sans nombre, le grand titre d’une feuille.',
  myProjects: 'Mes projets',
  projects: 'Projets',
  comments: 'Commentaires',
  threeProjects: '3 projets',
  fiftyProjects: '50 projets ou plus',
  sixComments: '6 commentaires',
  noComment: '0 commentaire',
  threads:
    'Le fil : une racine seule (aucun trait), puis deux réponses reliées par le trait et ses coudes, puis un commentaire supprimé qui garde sa réponse, puis un pied.',
  max: 'Max Girard',
  zoe: 'Zoé Martin',
  lea: 'Léa Moreau',
  ines: 'Inès Haddad',
  rootText: 'Super idée, je teste ce soir avec mes enfants.',
  zoeText: 'Moi aussi, dis-nous ce que ça donne !',
  leaText: 'Merci à vous deux, j’attends vos retours.',
  inesText: 'Ça marche aussi en anglais ?',
  deleted: 'Commentaire supprimé',
  footer: 'Réponse publiée.',
  previews:
    'L’aperçu sous un projet : « Voir les 6 commentaires », « Commenter », sans commentaire, puis sans bouton (ordinateur).',
  compactThread:
    'Les lignes de l’aperçu sont des cartes compactes rangées par fil : le texte sous le nom, le coude vers la réponse.',
  emptyLabel:
    'La phrase sans commentaire donnée par l’écran (`emptyLabel`) : projet privé, puis projet retiré (sans bouton).',
  seeAllCount:
    'Le compteur vaut 0 mais le membre a un commentaire à lire (`seeAllCount`) : « Voir le commentaire ».',
  kept: 'Un emplacement gardé sans que personne l’ait masqué (`keptBecause`) : projet privé, puis projet retiré.',
  list: 'La liste des fils (`CommentList`, fils en `listItem={false}`) : « Afficher la suite », chargement, erreur, puis vide.',
  rootCommentText: 'Super idée, je l’ai testé ce matin avec ma fille.',
  replyCommentText: 'Oui, la lumière de la cuisine suffit.',
  mineText: 'Est-ce que ça marche aussi en intérieur ?',
}

const en: typeof fr = {
  title: 'Thread, preview and counted title (R5b)',
  counted:
    'The counted title: the non-breaking dot, the “50+” cap, the plain space of comments, 0 without a number, the large title of a sheet.',
  myProjects: 'My projects',
  projects: 'Projects',
  comments: 'Comments',
  threeProjects: '3 projects',
  fiftyProjects: '50 projects or more',
  sixComments: '6 comments',
  noComment: '0 comments',
  threads:
    'The thread: a lone root (no line), then two replies joined by the line and its elbows, then a deleted comment that keeps its reply, then a footer.',
  max: 'Max Girard',
  zoe: 'Zoé Martin',
  lea: 'Léa Moreau',
  ines: 'Inès Haddad',
  rootText: 'Great idea, I am trying it tonight with my kids.',
  zoeText: 'Me too, tell us how it goes!',
  leaText: 'Thank you both, looking forward to your feedback.',
  inesText: 'Does it work in English too?',
  deleted: 'Comment deleted',
  footer: 'Reply posted.',
  previews:
    'The preview under a project: “See all 6 comments”, “Comment”, no comment, then no button (computer).',
  compactThread:
    'The preview lines are compact cards grouped by thread: the text under the name, the elbow to the reply.',
  emptyLabel:
    'The no-comment sentence given by the screen (`emptyLabel`): private project, then removed project (no button).',
  seeAllCount:
    'The count is 0 but the member has a comment to read (`seeAllCount`): “See the comment”.',
  kept: 'A placeholder kept although nobody hid it (`keptBecause`): private project, then removed project.',
  list: 'The list of threads (`CommentList`, threads as `listItem={false}`): “Show more”, loading, error, then empty.',
  rootCommentText: 'Great idea, I tried it this morning with my daughter.',
  replyCommentText: 'Yes, the kitchen light is enough.',
  mineText: 'Does it work indoors too?',
}

const noop = () => {}
/** L'heure figée du catalogue : la date relative ne dépend pas du moment de la visite. */
const NOW = new Date('2026-11-05T12:00:00.000Z')
const HOURS_AGO = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const HUGO = { id: 'hugo', name: 'Hugo Lefèvre', avatarUrl: null, handle: 'hugo_l' }
const SAM = { id: 'sam', name: 'Sam Bernard', avatarUrl: null, handle: 'sam_b' }

/** Les props communes d'une carte d'exemple : ni menu, ni masquage, rien à ouvrir. */
const base = {
  kind: 'root' as const,
  isMine: false,
  isProjectAuthor: false,
  menu: [],
  hiddenNote: null,
  onAuthorPress: noop,
  onMemberPress: noop,
  now: NOW,
}

/** Un commentaire d'exemple, tel que l'API le rend. */
const sample = (l: typeof fr, which: 'root' | 'reply' | 'mine' | 'kept'): CommentReply => ({
  id: which,
  author: which === 'kept' ? null : which === 'mine' ? SAM : HUGO,
  body:
    which === 'root'
      ? l.rootCommentText
      : which === 'reply'
        ? l.replyCommentText
        : which === 'mine'
          ? l.mineText
          : '',
  createdAt: which === 'kept' ? null : HOURS_AGO(which === 'reply' ? 1 : 3),
  editedAt: null,
  state: which === 'kept' ? 'hidden' : 'visible',
  isMine: which === 'mine',
  mentions: [],
  removal: null,
})

/** Une carte simplifiée : la photo à la taille de `CommentCard` (36 la racine, 28 une réponse). */
function Line({ name, text, reply = false }: { name: string; text: string; reply?: boolean }) {
  return (
    <Row gap="sm" align="start">
      <Avatar name={name} source={null} label={name} size={reply ? 28 : 36} />
      <Stack gap="xxs" grow>
        <Text variant="callout" weight={700}>
          {name}
        </Text>
        <Text>{text}</Text>
      </Stack>
    </Row>
  )
}

export function CommentThreadCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const replies = [
    <Line key="zoe" name={l.zoe} text={l.zoeText} reply />,
    <Line key="lea" name={l.lea} text={l.leaText} reply />,
  ]
  const lines = (
    <>
      <Line name={l.max} text={l.rootText} />
      <Line name={l.zoe} text={l.zoeText} />
      <Line name={l.ines} text={l.inesText} />
    </>
  )

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.counted}</Text>
      <CountedTitle title={l.myProjects} count={3} spokenCount={l.threeProjects} level={3} />
      <CountedTitle title={l.projects} count={50} more spokenCount={l.fiftyProjects} level={3} />
      <CountedTitle
        title={l.comments}
        count={6}
        spokenCount={l.sixComments}
        separator="space"
        level={3}
      />
      <CountedTitle
        title={l.comments}
        count={0}
        spokenCount={l.noComment}
        separator="space"
        level={3}
      />
      <CountedTitle
        title={l.comments}
        count={6}
        spokenCount={l.sixComments}
        separator="space"
        variant="title2"
        level={3}
      />

      <Text tone="secondary">{l.threads}</Text>
      {/* Les fils sont des éléments de liste : la liste qui les contient ne les enveloppe pas. */}
      <Stack gap="xl">
        <CommentThread root={<Line name={l.ines} text={l.inesText} />} />
        <CommentThread root={<Line name={l.max} text={l.rootText} />} replies={replies} />
        <CommentThread
          root={<Text tone="muted">{l.deleted}</Text>}
          replies={[<Line key="zoe" name={l.zoe} text={l.zoeText} reply />]}
        />
        <CommentThread
          root={<Line name={l.max} text={l.rootText} />}
          replies={[<Line key="lea" name={l.lea} text={l.leaText} reply />]}
          footer={<Text tone="secondary">{l.footer}</Text>}
        />
      </Stack>

      <Text tone="secondary">{l.previews}</Text>
      <CommentPreview count={6} action="all" onOpen={() => {}}>
        {lines}
      </CommentPreview>
      <CommentPreview count={3} action="comment" onOpen={() => {}}>
        {lines}
      </CommentPreview>
      <CommentPreview count={0} action="write" onOpen={() => {}} />
      <CommentPreview count={3} action={null} onOpen={() => {}}>
        {lines}
      </CommentPreview>

      {/* Les lignes sont des cartes compactes (CommentCard), rangées par fil comme dans la feuille :
          le texte sous le nom, le coude relie la réponse à sa racine (des-A10). */}
      <Text tone="secondary">{l.compactThread}</Text>
      <CommentPreview count={2} action="all" onOpen={() => {}}>
        <CommentThread
          listItem={false}
          root={<CommentCard {...base} compact comment={sample(l, 'root')} />}
          replies={[
            <CommentCard key="reply" {...base} compact kind="reply" comment={sample(l, 'reply')} />,
          ]}
        />
      </CommentPreview>

      {/* `emptyLabel` : la phrase de l'écran remplace « Aucun commentaire » (projet privé). Sans
          bouton : un lecteur qui n'écrit pas (projet retiré) n'en a pas. */}
      <Text tone="secondary">{l.emptyLabel}</Text>
      <CommentPreview
        count={0}
        action={null}
        emptyLabel={t(($) => $.project.comments.emptyPrivate)}
        onOpen={() => {}}
      />
      <CommentPreview
        count={0}
        action={null}
        emptyLabel={t(($) => $.project.comments.emptyRemoved)}
        onOpen={() => {}}
      />

      {/* `seeAllCount` : le compteur vaut 0, mais le membre a un commentaire à lire (le sien, que le
          compteur ne compte pas) : le bouton dit « Voir le commentaire ». */}
      <Text tone="secondary">{l.seeAllCount}</Text>
      <CommentPreview count={0} seeAllCount={1} action="all" onOpen={() => {}}>
        <CommentCard {...base} compact isMine comment={sample(l, 'mine')} />
      </CommentPreview>

      {/* Un emplacement `hidden` que personne n'a masqué : `keptBecause` dit pourquoi il est gardé. */}
      <Text tone="secondary">{l.kept}</Text>
      <Stack gap="sm">
        <CommentCard {...base} keptBecause="private" comment={sample(l, 'kept')} />
        <CommentCard {...base} keptBecause="removed" comment={sample(l, 'kept')} />
      </Stack>

      {/* `CommentList` : les fils d'un projet, dans une liste que les lecteurs d'écran annoncent ;
          `listItem={false}` : la liste pose déjà l'élément de liste autour de chaque fil. */}
      <Text tone="secondary">{l.list}</Text>
      {(['more', 'loading', 'error'] as const).map((state) => (
        <CommentList
          key={state}
          state={state}
          onMore={() => {}}
          moreLabel={t(($) => $.project.comments.more)}
          errorLabel={t(($) => $.project.comments.moreError)}
          retryLabel={t(($) => $.common.retry)}
          empty={t(($) => $.project.comments.empty)}
        >
          <CommentThread
            listItem={false}
            root={<CommentCard {...base} comment={sample(l, 'root')} onReply={() => {}} />}
            replies={[
              <CommentCard
                key="reply"
                {...base}
                kind="reply"
                comment={sample(l, 'reply')}
                onReply={() => {}}
              />,
            ]}
          />
        </CommentList>
      ))}
      <CommentList
        state="end"
        onMore={() => {}}
        moreLabel={t(($) => $.project.comments.more)}
        empty={t(($) => $.project.comments.empty)}
      />
    </Stack>
  )
}
