// Les commentaires de la page d'un projet (redessinés en R5b, docs/scenarios/refonte.md) :
// - sur téléphone, un aperçu (le titre « Commentaires 6 », les 3 premières lignes, un bouton) ; le
//   bouton ou une ligne ouvrent la feuille, avec la liste complète et le champ fixé en bas ;
// - sur ordinateur, dans la colonne de droite : 5 lignes et « Voir les N commentaires », qui déroule
//   la liste complète en place, puis le champ. Avec 5 commentaires ou moins, la liste complète
//   d'emblée : l'aperçu ne montre que ce qui est visible de tous, et sans bouton un commentaire masqué
//   ou retiré serait inatteignable pour ceux qui le lisent encore.
//
// Un composant à part : le texte en cours ne redessine pas toute la page à chaque lettre. Le brouillon
// vit ici, au-dessus de la feuille : la fermer garde le texte, et il reste à l'état React, jamais sur
// l'appareil (`useCommentDraft`). La liste et ses gestes sont dans ProjectCommentThreads.tsx.
//
// Le focus du clavier ne se perd jamais : la feuille le rend à ce qui l'a ouverte, « Répondre » et
// « Modifier » le posent dans le champ, un envoi l'y garde, une suppression l'envoie à la carte voisine,
// « Réessayer » à la première carte une fois les commentaires lus. Plus rien à côté : le champ, sinon
// le titre de la section.
//
// Qui n'écrit pas : un compte suspendu, et tout le monde sur un projet retiré par la modération (l'API
// refuse, 409). Ni champ, ni audience, ni « Écrire » ; mais « Voir » s'il y a de quoi lire.
import { type Comment, type CommentReply, CommentText, type Project } from '@ruche/contracts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useComments } from '../comments/api'
import { previewLines, threadLines } from '../comments/lines'
import { useCommentDraft } from '../comments/useCommentDraft'
import { useMentionable } from '../mentions/api'
import { useSuspension } from '../moderation/suspension'
import { useSignInAgain } from '../navigation/signInAgain'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { CommentCard } from '../ui/CommentCard'
import { CommentComposer } from '../ui/CommentComposer'
import { CommentPreview, type CommentPreviewAction } from '../ui/CommentPreview'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { LiveStatus } from '../ui/LiveStatus'
import { Notice } from '../ui/Notice'
import { Sheet } from '../ui/Sheet'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import type { TextFieldInput } from '../ui/TextField'
import { useLayout } from '../ui/theme/layout'
import {
  type CommentCards,
  CommentThreads,
  focusFirstCard,
  useCommentFailure,
} from './ProjectCommentThreads'

/** Le nombre de lignes de l'aperçu : 3 sur téléphone, 5 dans la colonne d'un ordinateur. */
const PREVIEW_LINES = { phone: 3, column: 5 } as const

const nothing = () => {}

export function Comments({ project }: { project: Project }) {
  const { t } = useTranslation()
  const toSource = useMediaSources()
  const { columns } = useLayout()
  const comments = useComments(project.id)
  const draft = useCommentDraft(project.id)
  const failure = useCommentFailure()
  const signInAgain = useSignInAgain()
  // Un compte suspendu lit les commentaires, mais n'a ni champ ni « Répondre » (tranche 7c).
  const { suspended } = useSuspension()
  const { data: session } = useSession()
  const me = useMe(Boolean(session), { retryOnMount: false })
  const count = project.commentCount
  const isPrivate = project.visibility === 'private'
  // Retiré par la modération : son auteur le lit encore, mais rien ne s'y ajoute (décision 22).
  const closed = project.removal !== null
  const readOnly = suspended || closed
  const threads: Comment[] = comments.data?.pages.flatMap((page) => page.items) ?? []

  // La feuille (téléphone) : ouverte ou non, et si elle s'ouvre le champ prêt.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openOnField, setOpenOnField] = useState(false)
  // La ligne de l'aperçu qui l'a ouverte : elle retrouve le focus à la fermeture (sinon le bouton).
  const openedFrom = useRef<string | null>(null)
  // La colonne (ordinateur) : la liste déroulée, par le bouton ou d'emblée. Une fois la liste complète
  // affichée, elle le reste : un 6e commentaire ne la replie pas sous les yeux du membre. Une `ref`
  // écrite pendant le rendu : elle ne fait que retenir ce qu'on vient de lire.
  const [unrolled, setUnrolled] = useState(false)
  const shownWhole = useRef(false)
  if (count <= PREVIEW_LINES.column) shownWhole.current = true
  const whole = columns && (unrolled || shownWhole.current)
  const focusAfterUnroll = useRef<{ shown: Set<string>; target: string | null } | null>(null)

  // Ce que la région annonce (seulement lu : décisions de Louis du 6/11), et ce qui refuse un texte
  // avant même l'API (des caractères invisibles).
  const [announcement, setAnnouncement] = useState('')
  const [invalid, setInvalid] = useState(false)
  // « Réessayer » relit la première page, et où va le focus une fois qu'il a fini.
  const [retrying, setRetrying] = useState(false)
  const focusAfterRetry = useRef(false)
  // La mention en cours de frappe (« @in »), repliée : `useMentionable` y répond toujours, et le champ
  // ne montre que les suggestions de cette recherche-là (`suggestionsFor`).
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const mentionable = useMentionable(project.id, mentionQuery)

  const inputRef = useRef<TextFieldInput>(null)
  const openButton = useRef<Focusable>(null)
  const titleRef = useRef<Focusable>(null)
  const cards = useRef<CommentCards>(new Map())
  const previewCards = useRef<CommentCards>(new Map())

  /** Le champ prend le focus ; le navigateur le fait venir à l'écran, le clavier s'ouvre sur téléphone. */
  const focusField = () => inputRef.current?.focus()

  /**
   * Plus rien de voisin où poser le focus : le champ, s'il y en a un ; sinon le titre de la section.
   * Pas dans une feuille sans champ : le titre serait hors de la fenêtre `aria-modal`, et le Modal rend
   * lui-même le focus à « Fermer » quand la confirmation part (mesuré, `suspendu-colonne.mjs`).
   */
  const focusLost = () => {
    if (inputRef.current) focusField()
    else if (!sheetOpen) {
      focusWithoutScroll(titleRef.current)
      moveReaderTo(titleRef.current)
    }
  }

  const lines = previewLines(threads, columns ? PREVIEW_LINES.column : PREVIEW_LINES.phone)
  // Ce que le membre peut lire, lui : le compteur ne compte pas son commentaire masqué ou retiré.
  const readable = threadLines(threads).filter((comment) => comment.author !== null).length

  // --- La feuille -----------------------------------------------------------------------------------

  const openSheet = (from: string | null, onField: boolean) => {
    openedFrom.current = from
    setOpenOnField(onField)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setAnnouncement('')
  }

  // La feuille vient de se fermer : le focus revient à ce qui l'a ouverte. Le bouton a pu changer de
  // texte, pas de place ; une ligne a pu quitter l'aperçu (un commentaire arrivé en tête) : le bouton.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !sheetOpen) {
      const line = openedFrom.current ? previewCards.current.get(openedFrom.current) : undefined
      if (!line?.focusCard()) {
        focusWithoutScroll(openButton.current)
        moveReaderTo(openButton.current)
      }
    }
    wasOpen.current = sheetOpen
  }, [sheetOpen])

  /** Quitter la page depuis une carte : la feuille se ferme d'abord, sinon elle resterait dessus (ui-B2). */
  const leave = (go: () => void) => {
    closeSheet()
    go()
  }

  // --- Dérouler la liste, sur ordinateur -------------------------------------------------------------

  const unroll = (target: string | null) => {
    focusAfterUnroll.current = { shown: new Set(lines.map((line) => line.comment.id)), target }
    setUnrolled(true)
  }

  // La liste vient de se dérouler par un geste : le bouton est parti avec le focus, qui va au premier
  // commentaire nouvellement montré (ou à celui qu'on a touché). Sans liste de dépendances : la `ref`
  // n'est posée que par ce geste, et les cartes existent une fois ce rendu posé.
  useEffect(() => {
    const pending = focusAfterUnroll.current
    if (!pending || !whole) return
    focusAfterUnroll.current = null
    const order = threadLines(threads).map((comment) => comment.id)
    const wanted = pending.target ? [pending.target] : order.filter((id) => !pending.shown.has(id))
    if (!focusFirstCard(cards.current, wanted)) focusLost()
  })

  // --- Écrire ---------------------------------------------------------------------------------------

  const changeText = (text: string) => {
    draft.setText(text)
    // Le texte a changé : l'ancien reproche et l'ancienne annonce ne valent plus. Vider la région
    // fait aussi relire la même phrase au prochain envoi.
    setInvalid(false)
    setAnnouncement('')
  }

  const send = async () => {
    // La même règle que l'API (packages/contracts) : pas de caractères invisibles. Les textes vides ou
    // trop longs, le champ les refuse lui-même.
    if (!CommentText.safeParse(draft.text).success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    const { mode } = draft
    const ok = await draft.send()
    if (!ok) return
    setAnnouncement(
      mode.kind === 'reply'
        ? t(($) => $.project.comments.replyPublished)
        : mode.kind === 'edit'
          ? t(($) => $.project.comments.saved)
          : t(($) => $.project.comments.published),
    )
    // Pour écrire la suite. `editable={false}` pendant l'envoi peut fermer le clavier sur iOS : ce
    // focus le rouvre.
    focusField()
  }

  const reply = (root: Comment, target: CommentReply) => {
    draft.startReply(root, target)
    setInvalid(false)
    setAnnouncement('')
    focusField()
  }

  const edit = (comment: CommentReply) => {
    draft.startEdit(comment)
    setInvalid(false)
    setAnnouncement('')
    focusField()
  }

  // Le message d'un envoi refusé : la raison, ou ce qui a raté selon le geste.
  const reason = draft.error?.reason
  const sendError = draft.error
    ? draft.mode.kind === 'reply'
      ? // 404 : le fil n'accepte plus de réponse (racine supprimée ou masquée entre-temps).
        reason === 'gone'
        ? t(($) => $.project.comments.replyGone)
        : failure(
            reason,
            t(($) => $.project.comments.replyError),
          )
      : draft.mode.kind === 'edit'
        ? failure(
            reason,
            t(($) => $.project.comments.editError),
          )
        : failure(
            reason,
            t(($) => $.project.comments.error),
          )
    : invalid
      ? t(($) => $.project.errors.invalidCharacters)
      : undefined
  // « Réessayer » ne vaut que pour une panne : les autres refus se répéteraient à l'identique.
  const sendAction = !draft.error
    ? undefined
    : reason === 'expired'
      ? signInAgain(closeSheet)
      : reason === undefined
        ? { label: t(($) => $.common.retry), role: 'button' as const, onPress: () => void send() }
        : undefined

  // La légende dit qui lira, selon le geste et le projet (les six textes d'aujourd'hui, jur-P1).
  const editedComment =
    draft.mode.kind === 'edit'
      ? threadLines(threads).find((comment) => comment.id === draft.highlightedId)
      : undefined
  const caption =
    draft.mode.kind === 'reply'
      ? isPrivate
        ? t(($) => $.project.comments.replyHintPrivate)
        : t(($) => $.project.comments.replyHint)
      : draft.mode.kind === 'edit'
        ? isPrivate
          ? t(($) => $.project.comments.hintPrivate)
          : editedComment?.state === 'hidden'
            ? t(($) => $.project.comments.editHintHidden)
            : t(($) => $.project.comments.editHint)
        : isPrivate
          ? t(($) => $.project.comments.hintPrivate)
          : t(($) => $.project.comments.hint)

  // Pas de `disabled` pour qui n'écrit pas : il n'a pas de champ du tout (relecture du plan, ui-I1).
  const composer = readOnly ? null : (
    <CommentComposer
      value={draft.text}
      onChangeText={changeText}
      onSend={() => void send()}
      pending={draft.sending}
      error={sendError}
      errorAction={sendAction}
      banner={
        draft.mode.kind === 'reply'
          ? { kind: 'reply', name: draft.mode.name }
          : draft.mode.kind === 'edit'
            ? { kind: 'edit' }
            : null
      }
      onCancelBanner={() => {
        draft.cancel()
        setInvalid(false)
      }}
      caption={caption}
      avatar={toSource(me.data?.avatarUrl)}
      memberName={me.data?.name ?? session?.user.name ?? ''}
      place={columns ? 'column' : 'sheet'}
      suggestions={mentionable.map((member) => ({
        id: member.id,
        name: member.name,
        handle: member.handle,
        avatar: toSource(member.avatarUrl),
      }))}
      suggestionsFor={mentionQuery}
      onQueryChange={setMentionQuery}
      inputRef={inputRef}
    />
  )

  // --- La section -----------------------------------------------------------------------------------

  const expired = errorKey(comments.error) === 'unauthorized'
  const failed = comments.isError && threads.length === 0

  const retry = async () => {
    setRetrying(true)
    await comments.refetch()
    focusAfterRetry.current = true
    setRetrying(false)
  }

  // « Réessayer » a fini. Encore en panne : le bouton est toujours là, avec son focus. Sinon il est
  // parti : le focus va à la première carte montée, et les cartes existent une fois ce rendu posé.
  // Sans liste de dépendances, comme plus haut : la `ref` n'est posée que par ce geste.
  useEffect(() => {
    if (!focusAfterRetry.current || retrying) return
    focusAfterRetry.current = false
    if (failed && !expired) return
    const ids = threadLines(threads).map((comment) => comment.id)
    const focused =
      whole || sheetOpen
        ? focusFirstCard(cards.current, ids)
        : lines.some((line) => previewCards.current.get(line.comment.id)?.focusCard())
    if (!focused) focusLost()
  })

  // La première page manque : on le dit, sans toucher au reste de la page. 401 : réessayer ne
  // servirait à rien, il faut se reconnecter. Pendant « Réessayer », le message et le bouton occupé
  // restent : React Query efface l'erreur dès la relecture, et un « Chargement… » à leur place
  // emporterait le focus du bouton.
  const trouble =
    failed || retrying ? (
      <>
        <Notice
          message={expired ? t(($) => $.states.expired) : t(($) => $.project.comments.loadError)}
          action={expired ? signInAgain(closeSheet) : undefined}
        />
        {expired ? null : (
          <Button
            label={t(($) => $.common.retry)}
            variant="secondary"
            size="compact"
            loading={retrying}
            onPress={() => void retry()}
          />
        )}
      </>
    ) : comments.isPending ? (
      <Text tone="muted">{t(($) => $.project.comments.loading)}</Text>
    ) : null

  const emptyLabel = closed
    ? t(($) => $.project.comments.emptyRemoved)
    : isPrivate
      ? t(($) => $.project.comments.emptyPrivate)
      : t(($) => $.project.comments.empty)

  const list = (
    <CommentThreads
      project={project}
      threads={threads}
      readOnly={readOnly}
      trouble={trouble}
      announcement={columns ? null : announcement}
      announce={setAnnouncement}
      draft={draft}
      cards={cards}
      onReply={reply}
      onEdit={edit}
      onFocusLost={focusLost}
      leave={leave}
      emptyLabel={emptyLabel}
    />
  )

  const previewCardsNodes = lines.map(({ comment, kind }) => (
    <CommentCard
      key={comment.id}
      handle={(handle) => {
        if (handle) previewCards.current.set(comment.id, handle)
        else previewCards.current.delete(comment.id)
      }}
      compact
      comment={comment}
      kind={kind}
      isMine={comment.isMine}
      isProjectAuthor={comment.author?.id === project.author.id}
      menu={[]}
      hiddenNote={null}
      avatar={comment.author ? toSource(comment.author.avatarUrl) : null}
      onAuthorPress={nothing}
      onMemberPress={nothing}
      onPress={() => (columns ? unroll(comment.id) : openSheet(comment.id, false))}
    />
  ))

  // Le bouton de l'aperçu. Dès qu'il y a de quoi lire, y compris un commentaire que le membre seul voit
  // (retiré, masqué : le compteur ne le compte pas), « Voir » ; sans rien à lire, écrire, ou aucun
  // bouton pour qui n'écrit pas.
  const action: CommentPreviewAction = columns
    ? whole
      ? null
      : 'all'
    : count === 0
      ? readable > 0
        ? 'all'
        : readOnly
          ? null
          : 'write'
      : readOnly || count > PREVIEW_LINES.phone
        ? 'all'
        : 'comment'

  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      {/* En colonne, la région vit ici, toujours montée : la liste, repliée, ne l'est pas, et un envoi
          n'y serait jamais annoncé. Dans la feuille, c'est la liste qui la porte. */}
      {columns ? <LiveStatus message={announcement} visible={false} /> : null}
      <CommentPreview
        count={count}
        action={action}
        emptyLabel={emptyLabel}
        // Le compteur vaut 0, mais le membre a quelque chose à lire : on dit ce qu'il va lire.
        seeAllCount={count > 0 ? count : readable}
        openRef={openButton}
        titleRef={titleRef}
        onOpen={() => (columns ? unroll(null) : openSheet(null, action !== 'all'))}
      >
        {whole ? list : sheetOpen ? previewCardsNodes : (trouble ?? previewCardsNodes)}
      </CommentPreview>
      {columns ? (
        composer
      ) : (
        <Sheet
          open={sheetOpen}
          onClose={closeSheet}
          // Pendant un envoi, la feuille ne se ferme pas : l'erreur éventuelle n'aurait plus où se dire.
          busy={draft.sending}
          title={t(($) => $.project.comments.title)}
          titleCount={{ count, spoken: t(($) => $.project.comments.spokenCount, { count }) }}
          {...(openOnField ? { initialFocusRef: inputRef } : null)}
          // Une feuille couvre le bandeau de la suspension : elle redit pourquoi il n'y a pas de champ.
          footer={
            suspended ? (
              <Text variant="callout" tone="secondary">
                {t(($) => $.project.comments.suspendedNote)}
              </Text>
            ) : (
              composer
            )
          }
        >
          {list}
        </Sheet>
      )}
    </Surface>
  )
}
