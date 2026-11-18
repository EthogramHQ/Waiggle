// Page « Mes commentaires » (tranche R11, « /settings/data/comments », planche
// R11-Mes-Commentaires), ouverte depuis Réglages → « Mes données » : tous ses commentaires et
// réponses, du plus récent au plus ancien, 30 par 30 (« Afficher la suite »), chacun avec le titre
// de son projet (ou « Projet qui n'est plus visible », sans rien nommer d'autre), sa date et le début
// de son texte.
//
// - Toucher un commentaire d'un projet visible l'ouvre à sa place dans le fil du projet
//   (`/projects/<id>?comment=<id>`, comme une notification, R8).
// - « Supprimer » demande confirmation, par la fenêtre du fil d'un projet (`DeleteCommentDialog`) :
//   une racine qui a des réponses le dit. La suppression passe par sa propre route
//   (DELETE /v1/me/comments/{id}), qui marche aussi sur un projet qu'on ne voit plus.
// - La liste reste figée tant que la fenêtre est là : la ligne supprimée ne part qu'une fois la
//   fenêtre partie (rien ne bouge derrière elle). Le focus va alors à la ligne suivante (à défaut,
//   la précédente), sinon au titre de la page.
import type { MyComment } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { useDeleteMyComment, useMyComments } from '../comments/api'
import { DeleteCommentDialog } from '../comments/DeleteCommentDialog'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { excerpt } from '../ui/CommentAction'
import { FeedEnd, useFirstArrived } from '../ui/FeedEnd'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ListGroup } from '../ui/ListGroup'
import { type MyCommentMark, MyCommentRow } from '../ui/MyCommentRow'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { useCommentFailure } from './ProjectCommentThreads'
import { LoadingScreen, SignedOutScreen } from './states'

/**
 * R16 : la garde de session commune (accounts/SessionGate.tsx). En attente, des rangées vides, à la
 * largeur de la page d'aujourd'hui (`form` : `shape="list"` seul choisirait `page`, plus large) ;
 * la session ne se lit pas : « Réessayer », pas « Me connecter » ; un visiteur : « Réservé aux
 * membres », puis retour ici une fois connecté.
 */
export function MyCommentsScreen() {
  return (
    <SessionGate loading={<LoadingScreen shape="list" width="form" />}>
      {() => <MyComments />}
    </SessionGate>
  )
}

/** L'adresse d'un commentaire à sa place dans le fil de son projet. */
const commentHref = (comment: MyComment) =>
  `/projects/${encodeURIComponent(comment.projectId)}?comment=${encodeURIComponent(comment.id)}`

/** Le début d'un texte, sur une ligne, pour le nom lu d'un lien ou d'un bouton. */
const excerptOf = (body: string) => excerpt(body.replace(/\s+/g, ' ').trim())

function MyComments() {
  const { t } = useTranslation()
  const router = useRouter()
  // Sans page d'avant (lien direct, page rechargée), le Retour mène à « Mes données ».
  const back = useGoBack('/settings/data')
  const list = useMyComments()
  const remove = useDeleteMyComment()
  const failure = useCommentFailure()
  const signInAgain = useSignInAgain()

  // Le commentaire dont on demande confirmation, et l'envoi en cours.
  const [deleting, setDeleting] = useState<MyComment | null>(null)
  const [removing, setRemoving] = useState(false)
  // Les erreurs de React Query restent jusqu'au prochain envoi : on ne les montre qu'après un envoi.
  const [showDeleteError, setShowDeleteError] = useState(false)
  // La liste telle qu'à l'ouverture de la fenêtre, tant qu'elle est là.
  const [frozen, setFrozen] = useState<MyComment[] | null>(null)
  // Les lignes à essayer pour le focus, dans l'ordre, une fois la ligne supprimée partie.
  const [focusTo, setFocusTo] = useState<string[] | null>(null)
  const afterClose = useRef<string[] | null>(null)
  // « Réessayer » sur une liste en erreur : React Query efface l'erreur pendant la relecture ; on
  // garde l'écran d'erreur (et le focus sur son bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)

  const titleRef = useRef<Focusable>(null)
  // Les vues des lignes montées, par commentaire : le focus y va après une suppression.
  const rows = useRef(new Map<string, Focusable>())

  const live = list.data?.pages.flatMap((page) => page.items) ?? []
  const items = frozen ?? live
  // La première ligne arrivée avec la dernière page : le focus du clavier y va quand « Afficher la
  // suite » disparaît, la liste finissant sans phrase (jur-RF2).
  const arrived = useFirstArrived(items.length, list.isFetchingNextPage)

  // La ligne supprimée vient de partir : le focus va à la première voisine encore là, sinon au
  // titre. Web : le focus du clavier, sans défilement ; téléphone : le lecteur d'écran.
  useEffect(() => {
    if (!focusTo || frozen) return
    setFocusTo(null)
    const node = focusTo.map((id) => rows.current.get(id)).find(Boolean) ?? titleRef.current
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [focusTo, frozen])

  /**
   * La fenêtre est partie : la liste reprend le cache (la ligne supprimée s'en va), et le focus
   * suit. Sur le web, à la fin du fondu (`onClosed`) ; sur téléphone, dès la fermeture (Android ne
   * prévient pas de la fin de son départ).
   */
  const release = () => {
    setFrozen(null)
    const targets = afterClose.current
    afterClose.current = null
    if (targets) setFocusTo(targets)
  }

  const close = () => {
    setDeleting(null)
    if (Platform.OS !== 'web') release()
  }

  const askToDelete = (comment: MyComment) => {
    setShowDeleteError(false)
    setFrozen(live)
    setDeleting(comment)
  }

  const confirmDelete = async () => {
    if (!deleting || removing) return
    setRemoving(true)
    setShowDeleteError(true)
    // Calculées avant : une fois supprimée, la ligne n'est plus dans la liste. D'abord les
    // suivantes, puis les précédentes, de la plus proche à la plus loin.
    const order = items.map((comment) => comment.id)
    const at = order.indexOf(deleting.id)
    const neighbors = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0)).reverse()]
    const ok = await remove.remove({ id: deleting.id, projectId: deleting.projectId })
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    afterClose.current = neighbors
    close()
  }

  const onRetry = async () => {
    setRetrying(true)
    await list.refetch()
    setRetrying(false)
  }

  // Une session expirée en arrivant : se reconnecter, pas réessayer.
  if (!list.data && list.isError && errorKey(list.error) === 'unauthorized')
    return <SignedOutScreen expired />
  const showsError = !list.data && (list.isError || retrying)

  const marksOf = (comment: MyComment): MyCommentMark[] => [
    ...(comment.hidden
      ? [{ icon: 'eye-slash' as const, label: t(($) => $.project.comments.hiddenByAuthor) }]
      : []),
    ...(comment.removed
      ? [{ icon: 'shield-check' as const, label: t(($) => $.project.comments.removedPlaceholder) }]
      : []),
  ]

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={t(($) => $.myComments.title)}
      titleRef={titleRef}
    >
      {showsError ? (
        // Une erreur avant toute page : on dit pourquoi et on propose de réessayer. Une suite
        // ratée, elle, garde les lignes déjà lues (FeedEnd, plus bas).
        <StateMessage
          kind="error"
          title={t(($) => $.myComments.loadError)}
          message={t(($) => $.errors[errorKey(list.error)])}
          actions={[
            { label: t(($) => $.common.retry), onPress: () => void onRetry(), loading: retrying },
          ]}
        />
      ) : !list.data ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : items.length === 0 ? (
        <StateMessage kind="empty" title={t(($) => $.myComments.empty)} />
      ) : (
        <Stack gap="lg">
          <ListGroup list>
            {items.map((comment, index) => {
              const short = excerptOf(comment.body)
              const title = comment.project?.title ?? null
              const href = commentHref(comment)
              const reply = comment.replyTo !== null
              return (
                <MyCommentRow
                  key={comment.id}
                  ref={(node: Focusable | null) => {
                    if (node) rows.current.set(comment.id, node)
                    else rows.current.delete(comment.id)
                    if (index === arrived.index) arrived.ref.current = node
                  }}
                  projectTitle={title}
                  goneLabel={t(($) => $.myComments.projectGone)}
                  date={comment.createdAt}
                  replyLabel={reply ? t(($) => $.myComments.reply) : undefined}
                  body={comment.body}
                  marks={marksOf(comment)}
                  {...(title === null
                    ? null
                    : {
                        openLabel: reply
                          ? t(($) => $.myComments.openReply, { title, excerpt: short })
                          : t(($) => $.myComments.open, { title, excerpt: short }),
                        href,
                        onOpen: (event) => {
                          // Sur le web, le lien est un vrai `<a>` : le routeur ouvre la page sans
                          // que le navigateur la recharge.
                          event?.preventDefault?.()
                          router.push(href)
                        },
                      })}
                  deleteText={t(($) => $.myComments.delete)}
                  deleteLabel={t(($) => $.myComments.deleteNamed, { excerpt: short })}
                  onDelete={() => askToDelete(comment)}
                />
              )
            })}
          </ListGroup>
          <FeedEnd
            state={
              list.isFetchingNextPage
                ? 'loading'
                : list.isFetchNextPageError
                  ? 'error'
                  : list.hasNextPage
                    ? 'more'
                    : 'end'
            }
            moreLabel={t(($) => $.myComments.more)}
            errorLabel={t(($) => $.myComments.moreError)}
            retryLabel={t(($) => $.common.retry)}
            firstArrived={arrived.ref}
            // Une seule demande à la fois, même après un double clic.
            onMore={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage()
            }}
          />
        </Stack>
      )}

      {/* Supprimer est définitif : la fenêtre du fil d'un projet demande confirmation. */}
      <DeleteCommentDialog
        visible={deleting !== null}
        hasReplies={deleting?.hasReplies ?? false}
        busy={removing}
        error={
          showDeleteError && remove.error
            ? failure(
                remove.reason,
                t(($) => $.project.comments.deleteError),
                t(($) => $.errors.rateLimited),
              )
            : null
        }
        errorAction={remove.reason === 'expired' ? signInAgain(() => close()) : undefined}
        onConfirm={() => void confirmDelete()}
        onCancel={close}
        onClosed={release}
      />
    </Screen>
  )
}
