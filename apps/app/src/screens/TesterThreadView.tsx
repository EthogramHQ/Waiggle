// Le fil privé entre un testeur et l'auteur d'un projet (R7b, docs/scenarios/refonte.md, « Les
// retours », « Réglé dans la v1.3 » ; planches R7b-Fil, R7b-Fil-Nuit et R7b-Desktop). Le même fil
// sert à deux endroits : l'onglet « Retours » du testeur (le coin des testeurs) et la page du fil
// d'un testeur, pour l'auteur (`TesterThreadScreen`). Celui qui le pose dit qui lit (`reader`).
//
// De haut en bas :
// - « Afficher les précédents », tant qu'il reste des messages plus anciens (`FeedEnd`, le bas
//   commun des listes, posé ici en haut : le fil se lit du plus ancien au plus récent) ;
// - les messages (`MessageBubble`), du plus ancien au plus récent, dans une liste ;
// - au pied, le compositeur (`CommentComposer` sans mentions : un fil se lit à deux), et sous lui la
//   phrase qui dit qui lit le fil ; ou, en lecture seule (ancien testeur, coin fermé), la phrase qui
//   dit pourquoi on ne peut plus répondre, au cadenas.
//
// Les gestes, par le menu « … » de chaque message :
// - supprimer le sien, après une confirmation (`DeleteMessageDialog`, plus bas) ;
// - signaler celui de l'autre (page « Signaler ») ;
// - pour l'auteur, sur un retour : « Marquer comme réglé » ou « Remettre à traiter » (au toucher,
//   « Réglé » paraît sous le retour) ; jamais dans un coin fermé (l'API refuserait).
// Le fil est marqué comme lu dès qu'il s'affiche (le point « non lu » de la liste de l'auteur).
//
// Le focus ne se perd jamais (relecture du plan, ui-B8) :
// - « Afficher les précédents » disparaît avec la dernière page : il va au plus ancien message ;
// - un message supprimé : au message d'avant, sinon à celui d'après, sinon au champ. La liste reste
//   figée pendant la confirmation, et ne perd le message qu'une fois la fenêtre partie (sinon la
//   fenêtre rendrait le focus au « … » d'un message qui n'existe plus) ;
// - une réponse envoyée : le focus reste dans le champ, vidé, pour écrire la suite.
//
// `layout` laisse l'écran ranger les deux morceaux : la page du fil colle le compositeur au bas de
// l'écran sur téléphone (`Screen footer`), comme la planche ; sans lui, ils se suivent.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import {
  NewTesterMessage,
  TESTER_MESSAGES_PER_DAY,
  type TesterMessage,
  type TesterRole,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useMediaSources } from '../api/media'
import { useSignInAgain } from '../navigation/signInAgain'
import { removalBanner } from '../reports/removal'
import {
  type CornerFailure,
  useDeleteMessage,
  useMarkThreadRead,
  useSendMessage,
  useSettleFeedback,
  useThreadMessages,
} from '../testers/corner-api'
import { draftKey, useDraft } from '../testers/drafts'
import { Button } from '../ui/Button'
import { CommentComposer } from '../ui/CommentComposer'
import { Dialog } from '../ui/Dialog'
import { FeedEnd } from '../ui/FeedEnd'
import { type Focusable, focusTarget, moveReaderTo } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { type ActionMenuItem, MessageBubble } from '../ui/MessageBubble'
import { Notice } from '../ui/Notice'
import { RemovalNotice } from '../ui/RemovalNotice'
import { shortDate } from '../ui/relativeDate'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import type { TextFieldInput } from '../ui/TextField'
import { useLayout } from '../ui/theme/layout'
import { useNameOf } from '../useNameOf'

/** Les deux morceaux du fil, que l'écran range à sa façon (`layout`). */
export type TesterThreadParts = {
  /** « Afficher les précédents », les messages, et les messages d'un geste raté. */
  messages: ReactNode
  /** Le compositeur et la phrase de qui lit, ou la phrase de la lecture seule ; null : rien. */
  footer: ReactNode
}

type Props = {
  projectId: string
  /** Le fil : celui du testeur qui porte cet identifiant. */
  testerId: string
  /** Le membre qui lit : la clé de son brouillon (deux comptes sur un appareil ne se voient pas). */
  memberId: string
  /** Qui lit : l'auteur du projet ou le testeur. */
  reader: TesterRole
  /** Le nom de l'auteur du projet et celui du testeur : qui parle dans chaque bulle. */
  authorName: string
  testerName: string
  /**
   * Pourquoi on ne peut plus répondre (« … ne fait plus partie des testeurs », « Le coin est
   * fermé… ») ; null : on peut répondre. On relit le fil, on supprime ses messages, on signale ceux
   * de l'autre.
   */
  readOnly: string | null
  /** Le coin est fermé (projet retiré, privé, auteur suspendu) : rien ne se règle. */
  closed: boolean
  /** Range les deux morceaux ; par défaut, l'un sous l'autre. */
  layout?: (parts: TesterThreadParts) => ReactElement
}

/** Pose le focus sur un message : au clavier sur le web (son « … »), le lecteur d'écran ailleurs. */
const focusMessage = (node: Focusable | null | undefined) => {
  if (!node) return false
  if (Platform.OS === 'web') focusTarget(node)?.focus?.({ preventScroll: true })
  else moveReaderTo(node)
  return true
}

export function TesterThreadView({
  projectId,
  testerId,
  memberId,
  reader,
  authorName,
  testerName,
  readOnly,
  closed,
  layout = ({ messages, footer }) => (
    <>
      {messages}
      {footer}
    </>
  ),
}: Props) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const nameOf = useNameOf()
  const { columns } = useLayout()
  const signInAgain = useSignInAgain()
  const thread = useThreadMessages(projectId, testerId)
  const settle = useSettleFeedback(projectId)
  const { markRead } = useMarkThreadRead(projectId, testerId)
  // L'autre personne du fil : celle qui lira ce qu'on écrit, et dont on signale les messages.
  const otherName = reader === 'author' ? testerName : authorName

  // L'API rend les pages du plus récent au plus ancien ; le fil se lit dans l'autre sens.
  const live = (thread.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse()
  // Le fil figé pendant la confirmation d'une suppression (voir l'en-tête) ; null : le cache.
  const [frozen, setFrozen] = useState<TesterMessage[] | null>(null)
  // Les messages supprimés pendant la visite, l'API d'accord : une relecture partie avant ne les
  // ramène pas.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const shown = (frozen ?? live).filter((message) => !gone.has(message.id))

  // --- Le fil lu à l'affichage ---------------------------------------------------------------------

  // Une fois par fil affiché : le point « non lu » de la liste de l'auteur s'éteint.
  const markedFor = useRef<string | null>(null)
  const loaded = thread.data !== undefined
  useEffect(() => {
    if (!loaded || markedFor.current === testerId) return
    markedFor.current = testerId
    void markRead()
  }, [loaded, testerId, markRead])

  // --- Le focus sur les messages -----------------------------------------------------------------

  // Où poser le focus sur chaque message, par identifiant : une mémoire qui survit aux affichages
  // sans en provoquer (`useRef`). Et le plus ancien, pour `FeedEnd` (« Afficher les précédents »).
  const nodes = useRef(new Map<string, Focusable>())
  const oldest = useRef<Focusable>(null)
  const focusRefOf = (id: string, index: number) => (node: Focusable | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
    if (index === 0) oldest.current = node
  }
  const inputRef = useRef<TextFieldInput>(null)

  // --- Supprimer le sien -------------------------------------------------------------------------

  const [deleting, setDeleting] = useState<TesterMessage | null>(null)
  // Le message supprimé et sa place, en attendant que la fenêtre soit partie.
  const confirmed = useRef<{ id: string; index: number } | null>(null)
  // La place du message parti : où rendre le focus une fois la liste à jour.
  const [focusAfter, setFocusAfter] = useState<number | null>(null)

  const openDelete = (message: TesterMessage) => {
    setFrozen(live.filter((one) => !gone.has(one.id)))
    setDeleting(message)
  }
  /** La fenêtre est partie : la liste reprend le cache et perd le message supprimé. */
  const release = () => {
    const done = confirmed.current
    confirmed.current = null
    if (done) {
      setGone((before) => new Set(before).add(done.id))
      setFocusAfter(done.index)
    }
    setFrozen(null)
  }
  // La liste vient de perdre le message : le focus va à celui d'avant, sinon à celui d'après,
  // sinon au champ (il n'y a plus de message du tout).
  useEffect(() => {
    if (focusAfter === null || frozen) return
    setFocusAfter(null)
    const next = shown[focusAfter - 1] ?? shown[focusAfter]
    if (!focusMessage(next ? nodes.current.get(next.id) : null)) inputRef.current?.focus()
  }, [focusAfter, frozen, shown])

  // --- Les menus ---------------------------------------------------------------------------------

  const menuOf = (message: TesterMessage): ActionMenuItem[] => {
    const items: ActionMenuItem[] = []
    // L'auteur règle un retour du testeur, ou le remet à traiter (même place dans le menu : le
    // libellé change, pas l'action).
    if (reader === 'author' && message.kind === 'feedback' && !closed) {
      items.push(
        message.settled
          ? {
              label: t(($) => $.project.testers.thread.unsettle),
              icon: 'arrows-clockwise',
              onPress: () => void settle.unsettle(message.id),
            }
          : {
              label: t(($) => $.project.testers.thread.settle),
              icon: 'check-circle',
              onPress: () => void settle.settle(message.id),
            },
      )
    }
    if (message.mine) {
      items.push({
        label: t(($) => $.project.testers.thread.delete),
        icon: 'trash',
        tone: 'danger',
        onPress: () => openDelete(message),
      })
    } else {
      items.push({
        label: t(($) => $.project.testers.thread.report),
        icon: 'flag',
        onPress: () =>
          router.push({ pathname: '/report', params: { kind: 'message', id: message.id } }),
      })
    }
    return items
  }

  // « Réglé dans la v1.3 », « Réglé dans la mise à jour du 3 nov. », ou « Réglé » (à la main, ou une
  // mise à jour retirée que le lecteur ne voit plus).
  const settledText = (message: TesterMessage) => {
    const settled = message.settled
    if (!settled) return null
    const update = settled.update
    if (update?.version)
      return t(($) => $.project.testers.thread.settledIn, { version: update.version })
    if (update)
      return t(($) => $.project.testers.thread.settledOn, {
        date: shortDate(update.createdAt, i18n.language),
      })
    return t(($) => $.project.testers.thread.settled)
  }

  const bubble = (message: TesterMessage, index: number) => {
    const outcome = message.outcome
    const device = message.device
    const capture = message.capture ? toSource(message.capture.url) : null
    return (
      <MessageBubble
        key={message.id}
        focusRef={focusRefOf(message.id, index)}
        from={message.sender}
        kind={message.kind}
        mine={message.mine}
        name={message.sender === 'author' ? authorName : testerName}
        text={message.text}
        at={message.createdAt}
        outcome={
          outcome
            ? { value: outcome, label: t(($) => $.project.testers.feedback.outcomes[outcome]) }
            : null
        }
        device={device ? t(($) => $.project.testers.feedback.devices[device]) : null}
        deviceKind={device}
        capture={
          capture
            ? {
                source: capture,
                // Un nom lu fixe, jamais une description écrite par le membre (juridique J8).
                description: message.mine
                  ? t(($) => $.project.testers.feedback.captureNameMine)
                  : t(($) => $.project.testers.feedback.captureName, {
                      nameOf: nameOf(testerName),
                    }),
              }
            : null
        }
        settled={settledText(message)}
        removal={
          message.removal ? (
            <RemovalNotice {...removalBanner(message.removal, t)} compact />
          ) : undefined
        }
        menu={menuOf(message)}
      />
    )
  }

  // --- Répondre ----------------------------------------------------------------------------------

  const [text, setText, clearText] = useDraft(draftKey(memberId, projectId, 'reply', testerId), '')
  const reply = useSendMessage(projectId, testerId)
  // Le texte du champ à l'instant : ce qu'on tape pendant l'envoi reste (seul ce qui est parti
  // s'efface à la réponse).
  const latestText = useRef(text)
  latestText.current = text
  const sending = useRef(false)
  // Des caractères invisibles seulement : refusés avant l'envoi, comme l'API (packages/contracts).
  const [invalid, setInvalid] = useState(false)

  const changeText = (value: string) => {
    setText(value)
    setInvalid(false)
  }

  const send = async () => {
    if (sending.current) return
    const sent = latestText.current
    if (!NewTesterMessage.safeParse({ kind: 'reply', text: sent }).success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    sending.current = true
    const ok = await reply.send({ kind: 'reply', text: sent })
    sending.current = false
    if (!ok) return
    const now = latestText.current
    if (now === sent) clearText()
    else if (now.startsWith(sent)) setText(now.slice(sent.length).trimStart())
    // Pour écrire la suite ; sur téléphone, le clavier reste ouvert.
    inputRef.current?.focus()
  }

  const replyFailure = (reason: CornerFailure | undefined) => {
    switch (reason) {
      case 'limited':
        return t(($) => $.project.testers.feedback.limited, { max: TESTER_MESSAGES_PER_DAY })
      case 'expired':
        return t(($) => $.states.expired)
      case 'closed':
        return t(($) => $.project.testers.thread.closedCorner)
      default:
        return t(($) => $.project.testers.thread.replyError)
    }
  }
  const replyError = reply.error
    ? replyFailure(reply.reason)
    : invalid
      ? t(($) => $.project.errors.invalidCharacters)
      : undefined
  // « Réessayer » ne vaut que pour une panne : les autres refus se répéteraient à l'identique.
  const replyAction = !reply.error
    ? undefined
    : reply.reason === 'expired'
      ? signInAgain()
      : reply.reason === undefined
        ? { label: t(($) => $.common.retry), role: 'button' as const, onPress: () => void send() }
        : undefined

  // --- Les morceaux --------------------------------------------------------------------------------

  const settleError = settle.error
    ? settle.reason === 'limited'
      ? t(($) => $.project.testers.thread.settleLimited)
      : settle.reason === 'expired'
        ? t(($) => $.states.expired)
        : settle.reason === 'closed'
          ? t(($) => $.project.testers.thread.closedCorner)
          : t(($) => $.project.testers.thread.settleError)
    : null

  const earlier = thread.isFetchingNextPage
    ? 'loading'
    : thread.isFetchNextPageError
      ? 'error'
      : thread.hasNextPage
        ? 'more'
        : 'end'

  const messages = !loaded ? (
    thread.isError ? (
      // La première page n'a pas pu se charger : une issue.
      <StateMessage
        kind="error"
        message={t(($) => $.project.testers.thread.loadError)}
        actions={[
          {
            label: t(($) => $.common.retry),
            onPress: () => void thread.refetch(),
            loading: thread.isFetching,
          },
        ]}
      />
    ) : (
      <SkeletonList count={2} />
    )
  ) : (
    <Stack gap="lg">
      <FeedEnd
        state={earlier}
        moreLabel={t(($) => $.project.testers.thread.showEarlier)}
        errorLabel={t(($) => $.project.testers.thread.earlierError)}
        retryLabel={t(($) => $.common.retry)}
        onMore={() => void thread.fetchNextPage()}
        firstArrived={oldest}
      />
      {shown.length === 0 ? (
        <StateMessage
          kind="empty"
          message={
            reader === 'tester'
              ? t(($) => $.project.testers.thread.emptyTester, { name: authorName })
              : t(($) => $.project.testers.thread.emptyAuthor)
          }
        />
      ) : (
        // Les bulles posent elles-mêmes leur élément de liste (`ownItems`).
        <Stack accessibilityRole="list" ownItems gap="lg">
          {shown.map(bubble)}
        </Stack>
      )}
      {settleError ? <Notice message={settleError} /> : null}
      <DeleteMessageDialog
        projectId={projectId}
        testerId={testerId}
        message={deleting}
        otherName={otherName}
        onDeleted={(message) => {
          confirmed.current = {
            id: message.id,
            index: shown.findIndex((one) => one.id === message.id),
          }
        }}
        onClose={() => setDeleting(null)}
        onGone={release}
      />
    </Stack>
  )

  // Le testeur n'a encore rien écrit : il commence par « Envoyer un retour » (le coin), pas par une
  // réponse ; et l'auteur ne répond qu'à un fil qui a un message du testeur (409 `thread_closed`).
  const canReply = readOnly === null && shown.some((message) => message.sender === 'tester')
  const footer = !loaded ? null : readOnly !== null ? (
    <Hint icon="lock-simple" text={readOnly} />
  ) : canReply ? (
    <CommentComposer
      value={text}
      onChangeText={changeText}
      onSend={() => void send()}
      pending={reply.pending}
      error={replyError}
      errorAction={replyAction}
      banner={null}
      onCancelBanner={() => {}}
      caption={
        reader === 'author'
          ? t(($) => $.project.testers.thread.privacyAuthor, { name: testerName })
          : t(($) => $.project.testers.thread.privacyTester, { name: authorName })
      }
      place={columns ? 'column' : 'sheet'}
      mentions={false}
      placeholder={t(($) => $.project.testers.thread.replyPlaceholder, { name: otherName })}
      sendLabel={t(($) => $.project.testers.thread.replyLabel)}
      inputRef={inputRef}
    />
  ) : null

  return layout({ messages, footer })
}

type DeleteProps = {
  projectId: string
  testerId: string
  /** Le message dont on demande la suppression ; null : la fenêtre est fermée. */
  message: TesterMessage | null
  /** L'autre personne du fil, qui ne le verra plus non plus. */
  otherName: string
  /** L'API a supprimé le message ; la fenêtre se ferme ensuite d'elle-même. */
  onDeleted: (message: TesterMessage) => void
  /** Dans tous les cas : l'écran remet `message` à null. */
  onClose: () => void
  /** La fenêtre a fini de partir, une fois par ouverture (voir `DeleteUpdateDialog`). */
  onGone: () => void
}

/**
 * « Supprimer ce message ? », avec les soins de `DeleteUpdateDialog` (R7a) : garde contre la double
 * tape, focus sur « Annuler », pas de fermeture pendant l'envoi, l'erreur après un envoi seulement,
 * et `onGone` à la fin du fondu (web) ou dès la fermeture (téléphone, où Android ne prévient pas).
 */
function DeleteMessageDialog({
  projectId,
  testerId,
  message,
  otherName,
  onDeleted,
  onClose,
  onGone,
}: DeleteProps) {
  const { t } = useTranslation()
  const deletion = useDeleteMessage(projectId, testerId)
  const signInAgain = useSignInAgain()
  const visible = message !== null
  const [removing, setRemoving] = useState(false)
  // Deux appuis dans le même instant : le second est ignoré (une seule suppression envoyée).
  const sendingRef = useRef(false)
  const [sent, setSent] = useState(false)
  const cancelRef = useRef<Focusable>(null)
  // Le message de la dernière ouverture : le texte ne change pas pendant que la fenêtre s'en va.
  const last = useRef(message)
  if (message) last.current = message
  const removed = (message ?? last.current)?.removal != null

  const waitingForGone = useRef(false)
  const wasVisible = useRef(false)
  const arrived = () => {
    if (!waitingForGone.current) return
    waitingForGone.current = false
    onGone()
  }
  const arrivedRef = useRef(arrived)
  arrivedRef.current = arrived
  useEffect(() => {
    if (visible) {
      waitingForGone.current = true
      setSent(false)
    } else if (wasVisible.current && Platform.OS !== 'web') {
      arrivedRef.current()
    }
    wasVisible.current = visible
  }, [visible])

  const confirm = async () => {
    if (!message || sendingRef.current) return
    sendingRef.current = true
    setRemoving(true)
    setSent(true)
    const ok = await deletion.remove(message.id)
    sendingRef.current = false
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    onDeleted(message)
    onClose()
  }

  return (
    <Dialog
      visible={visible}
      guardTaps
      title={t(($) => $.project.testers.thread.deleteTitle)}
      message={
        removed
          ? t(($) => $.project.testers.thread.deleteBodyRemoved, { name: otherName })
          : t(($) => $.project.testers.thread.deleteBody, { name: otherName })
      }
      initialFocusRef={cancelRef}
      busy={removing}
      onDismiss={() => {
        if (!removing) onClose()
      }}
      onClosed={arrived}
    >
      {sent && deletion.error ? (
        <Notice
          message={
            deletion.reason === 'expired'
              ? t(($) => $.states.expired)
              : t(($) => $.project.testers.thread.deleteError)
          }
          action={deletion.reason === 'expired' ? signInAgain(onClose) : undefined}
        />
      ) : null}
      <Button
        label={t(($) => $.project.testers.thread.deleteConfirm)}
        variant="confirm"
        onPress={() => void confirm()}
        loading={removing}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={onClose}
        disabled={removing}
      />
    </Dialog>
  )
}
