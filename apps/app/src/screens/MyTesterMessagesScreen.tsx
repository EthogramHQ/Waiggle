// Page « Mes retours envoyés » (R11, « /settings/data/feedback », planche R11-Mes-Retours), ouverte
// depuis Réglages → Mes données. Scénario : docs/scenarios/refonte.md, « R11 — La conformité ».
//
// Les retours et réponses que le membre a écrits comme testeur, dans le coin de n'importe quel
// projet. L'API les rend à plat, les plus récents d'abord ; la page les regroupe par projet (une
// carte par projet, `SentFeedbackGroup`), les projets dans l'ordre de leur message le plus récent,
// les messages dans l'ordre reçu. « Afficher la suite » charge la page suivante.
//
// - Coin ouvert : « Ouvrir le coin » y mène (/projects/<id>/testers).
// - Coin fermé (projet retiré ou privé, testeur parti) : « Coin fermé » et « Seuls tes messages
//   restent ici. » (qui voit quoi), sans lien ; les messages se relisent et se suppriment encore.
// - Projet qu'on ne voit plus : « Projet qui n’est plus visible », sans auteur ni lien. Tous ces
//   messages vont dans une seule carte : rien ne distingue deux projets qu'on ne voit plus.
//
// « Supprimer » passe par la route du coin (`useDeleteMessage`, dans `DeleteMessageDialog`), avec
// la phrase du coin qui nomme l'auteur du projet, ou une phrase qui ne nomme personne pour un projet
// qu'on ne voit plus (relecture du plan, U5). La liste reste telle quelle pendant la fenêtre et ne
// perd le message qu'une fois la fenêtre partie ; le focus va alors au « Supprimer » du message
// suivant (sinon du précédent), sinon au titre de la page : il ne se perd jamais.
//
// Ce fichier assemble des pièces de `src/ui`, sans écrire de style (règle des étages).
import type { MyTesterMessage } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useForgetMyTesterMessage, useMyTesterMessages } from '../testers/corner-api'
import { DeleteMessageDialog, type MessageToDelete } from '../testers/DeleteMessageDialog'
import { excerpt } from '../ui/CommentAction'
import { FeedEnd, useFirstArrived } from '../ui/FeedEnd'
import { type Focusable, focusTarget, moveReaderTo } from '../ui/focus'
import { Screen } from '../ui/Screen'
import { SentFeedbackGroup, SentFeedbackMessage } from '../ui/SentFeedback'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { LoadingScreen, SignedOutScreen } from './states'

/**
 * R16 : la garde de session commune (accounts/SessionGate.tsx). En attente, des rangées vides, à la
 * largeur de la page d'aujourd'hui (`form` : `shape="list"` seul choisirait `page`, plus large) ;
 * la session ne se lit pas : « Réessayer », pas « Me connecter » ; un visiteur : « Réservé aux
 * membres ». La page reçoit l'identifiant du membre, lu dans la session que la garde lui passe.
 */
export function MyTesterMessagesScreen() {
  return (
    <SessionGate loading={<LoadingScreen shape="list" width="form" />}>
      {(session) => <MyTesterMessages memberId={session.user.id} />}
    </SessionGate>
  )
}

/** Les messages d'un même projet ; `project` null : les projets qu'on ne voit plus, ensemble. */
type Group = {
  key: string
  project: MyTesterMessage['project']
  closed: boolean
  messages: MyTesterMessage[]
}

// Regroupe la liste à plat par projet : chaque projet prend la place de son premier message (le
// plus récent), et ses messages restent dans l'ordre reçu.
const groupByProject = (messages: MyTesterMessage[]): Group[] => {
  const groups = new Map<string, Group>()
  for (const message of messages) {
    const key = message.project ? message.projectId : 'gone'
    const group = groups.get(key)
    if (group) {
      group.messages.push(message)
      group.closed ||= message.closed
    } else {
      groups.set(key, {
        key,
        project: message.project,
        closed: message.closed,
        messages: [message],
      })
    }
  }
  return [...groups.values()]
}

/** Pose le focus : au clavier sur le web, le lecteur d'écran ailleurs. */
const focusOn = (node: Focusable | null | undefined) => {
  if (!node) return false
  if (Platform.OS === 'web') focusTarget(node)?.focus?.({ preventScroll: true })
  else moveReaderTo(node)
  return true
}

function MyTesterMessages({ memberId }: { memberId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  // La page s'ouvre depuis « Mes données » ; sans historique, on y revient.
  const back = useGoBack('/settings/data')
  const list = useMyTesterMessages()
  const forget = useForgetMyTesterMessage()

  // « Réessayer » sur une liste en erreur : React Query efface l'erreur pendant la relecture ; on
  // garde l'écran d'erreur (et le focus sur son bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)
  const onRetry = async () => {
    setRetrying(true)
    await list.refetch()
    setRetrying(false)
  }

  // Les messages supprimés pendant la visite : une relecture partie avant ne les ramène pas.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const items = (list.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (one) => !gone.has(one.id),
  )
  const groups = groupByProject(items)
  // L'ordre de lecture, groupe après groupe : où va le focus après une suppression.
  const ordered = groups.flatMap((group) => group.messages)
  const arrived = useFirstArrived(items.length, list.isFetchingNextPage)

  // --- Supprimer ---------------------------------------------------------------------------------

  const [deleting, setDeleting] = useState<MyTesterMessage | null>(null)
  // Le message supprimé et sa place, en attendant que la fenêtre soit partie.
  const confirmed = useRef<{ id: string; index: number } | null>(null)
  const [focusAfter, setFocusAfter] = useState<number | null>(null)
  // Le « Supprimer » de chaque message, par identifiant, et le titre de la page.
  const deleteButtons = useRef(new Map<string, Focusable>())
  const titleRef = useRef<Focusable>(null)
  const deleteRefOf = (id: string) => (node: Focusable | null) => {
    if (node) deleteButtons.current.set(id, node)
    else deleteButtons.current.delete(id)
  }

  /** La fenêtre est partie : la liste perd le message supprimé, le focus suit. */
  const release = () => {
    const done = confirmed.current
    confirmed.current = null
    if (!done) return
    setGone((before) => new Set(before).add(done.id))
    forget(done.id)
    setFocusAfter(done.index)
  }
  // La liste vient de perdre le message : le focus va au suivant (à sa place), sinon au précédent,
  // sinon au titre de la page.
  useEffect(() => {
    if (focusAfter === null) return
    setFocusAfter(null)
    const next = ordered[focusAfter] ?? ordered[focusAfter - 1]
    if (focusOn(next ? deleteButtons.current.get(next.id) : null)) return
    focusOn(titleRef.current)
  }, [focusAfter, ordered])

  const toDelete: MessageToDelete | null = deleting
    ? {
        id: deleting.id,
        projectId: deleting.projectId,
        removed: deleting.removed,
        otherName: deleting.project?.author.name ?? null,
      }
    : null

  // --- La page -----------------------------------------------------------------------------------

  // Une session expirée en arrivant : se reconnecter, pas réessayer.
  if (!list.data && list.isError && errorKey(list.error) === 'unauthorized')
    return <SignedOutScreen expired />
  const showsError = !list.data && (list.isError || retrying)

  const message = (one: MyTesterMessage) => {
    const outcome = one.outcome
    const capture = one.media ? toSource(one.media.url) : null
    const said = excerpt(one.text ?? '') || t(($) => $.project.testers.feedback.captureNameMine)
    const index = items.indexOf(one)
    return (
      <SentFeedbackMessage
        key={one.id}
        outcome={
          outcome
            ? {
                value: outcome,
                label: t(($) => $.project.testers.feedback.outcomes[outcome]),
                spokenLabel: t(($) => $.project.testers.feedback.outcomeSpoken, {
                  outcome: t(($) => $.project.testers.feedback.outcomes[outcome]),
                }),
              }
            : null
        }
        at={one.createdAt}
        text={one.text}
        capture={
          capture && one.media
            ? {
                source: capture,
                width: one.media.width,
                height: one.media.height,
                // Un nom lu fixe, jamais une description écrite par le membre (juridique J8).
                description: t(($) => $.project.testers.feedback.captureNameMine),
              }
            : null
        }
        note={one.removed ? t(($) => $.removal.banner) : null}
        deleteLabel={t(($) => $.myFeedback.delete)}
        deleteSpokenLabel={t(($) => $.myFeedback.deleteNamed, { excerpt: said })}
        onDelete={() => setDeleting(one)}
        deleteRef={(node: Focusable | null) => {
          deleteRefOf(one.id)(node)
          // La première ligne arrivée avec la dernière page : « Afficher la suite » disparu, le
          // focus va à son « Supprimer ».
          if (index === arrived.index) arrived.ref.current = node
        }}
      />
    )
  }

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={t(($) => $.myFeedback.title)}
      titleRef={titleRef}
    >
      {showsError ? (
        // Une erreur avant toute page : on dit pourquoi et on propose de réessayer. Une suite
        // ratée, elle, garde les messages déjà lus (FeedEnd, plus bas).
        <StateMessage
          kind="error"
          title={t(($) => $.myFeedback.loadError)}
          message={t(($) => $.errors[errorKey(list.error)])}
          actions={[
            { label: t(($) => $.common.retry), onPress: () => void onRetry(), loading: retrying },
          ]}
        />
      ) : !list.data ? (
        <StateMessage kind="loading" message={t(($) => $.common.loading)} />
      ) : items.length === 0 ? (
        <StateMessage kind="empty" message={t(($) => $.myFeedback.empty)} />
      ) : (
        <Stack gap="lg">
          {groups.map((group) => {
            const project = group.project
            return (
              <SentFeedbackGroup
                key={group.key}
                title={project ? project.title : t(($) => $.myFeedback.projectGone)}
                subtitle={project?.author.name ?? null}
                thumb={project?.cover ? toSource(project.cover.url) : null}
                gone={!project}
                open={
                  project && !group.closed
                    ? {
                        label: t(($) => $.myFeedback.openCorner),
                        spokenLabel: t(($) => $.myFeedback.openCornerNamed, {
                          title: project.title,
                        }),
                        onPress: () => router.push(`/projects/${project.id}/testers`),
                      }
                    : null
                }
                closed={
                  project && group.closed
                    ? {
                        label: t(($) => $.myFeedback.closed),
                        note: t(($) => $.myFeedback.closedNote),
                      }
                    : null
                }
              >
                {group.messages.map(message)}
              </SentFeedbackGroup>
            )
          })}
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
            moreLabel={t(($) => $.myFeedback.more)}
            errorLabel={t(($) => $.myFeedback.moreError)}
            retryLabel={t(($) => $.common.retry)}
            firstArrived={arrived.ref}
            // Une seule demande à la fois, même après un double clic.
            onMore={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage()
            }}
          />
        </Stack>
      )}

      <DeleteMessageDialog
        testerId={memberId}
        message={toDelete}
        onDeleted={(messageId) => {
          confirmed.current = {
            id: messageId,
            index: ordered.findIndex((one) => one.id === messageId),
          }
        }}
        onClose={() => setDeleting(null)}
        onGone={release}
      />
    </Screen>
  )
}
