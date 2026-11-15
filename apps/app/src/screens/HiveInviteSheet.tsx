// La feuille « Inviter dans Famille » (R10, docs/scenarios/refonte.md, « Inviter », planche
// R10-Inviter) : chercher un membre de Waiggle par son nom ou son pseudo, l'inviter, et voir la carte
// qu'il recevra (« Ce que reçoit Max »).
//
// La feuille a sa propre adresse, `/hives/<id>/invite` (`app/hives/[id]/invite.tsx`, `sheetRoute`
// dans `app/_layout.tsx`), posée sur la page de la ruche ; la fermer y revient (`useRouteSheet`,
// repli `/hives/<id>` quand on arrive par un lien direct).
//
// - La recherche part 250 ms après la dernière lettre (une demande par mot, pas une par lettre : on
//   dit « debounce »), à partir de 2 lettres. Sous 3 lettres, l'API ne propose que les membres suivis
//   et ceux de ses ruches (relecture du plan, sécurité A3 et juridique B1) : la feuille le dit, sinon
//   on croirait que la personne cherchée n'est pas membre. Le nombre de résultats est lu à chaque
//   réponse (`LiveStatus`), sans rien montrer de plus. Pendant une nouvelle recherche, les lignes
//   d'avant restent en place : rien ne saute sous le doigt.
// - Chaque résultat : sa photo, son nom, son pseudo, et à droite « Inviter » (lu « Inviter Max
//   Durand »), ou « Déjà membre », ou « Invitation envoyée » (une invitation refusée comprise, jusqu'à
//   ses 30 jours : décision de Louis du 14/11/2026, Q1).
// - « Inviter » touché : le même bouton, sous la même clé, devient « Invitation envoyée » ; il reste
//   un bouton atteignable (le focus ne tombe pas sur la page) et ne fait plus rien. Deux tapes
//   rapides n'envoient qu'une invitation : la garde est un `ref`, lu et posé au toucher (un état
//   React ne serait à jour qu'au rendu suivant, trop tard pour la seconde tape).
// - Un refus de l'API se lit au pied de la feuille (`Sheet notice`, une alerte) et y reste jusqu'à
//   la réponse de l'envoi suivant : la ruche pleine, le quota du jour, la suspension, la session
//   expirée (« Me reconnecter »), un membre qu'on ne peut pas inviter (404 : inconnu ou bloqué, l'API
//   ne dit pas lequel). Un membre déjà invité entre-temps (409) n'est pas une erreur : la ligne dit
//   « Invitation envoyée ».
// - En tête, les places qui restent (50 au plus, invitations en attente comprises) ; la ruche pleine,
//   ou réservée à l'animateur, le dit à la place, et « Inviter » se grise.
// - Un membre suspendu n'a rien de neuf ici : l'API refuse, et la feuille dit pourquoi.
import {
  HIVE_LIMITS,
  type HivePage,
  type InvitableMember,
  type HiveInvitation as Invitation,
} from '@ruche/contracts'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useHive, useInvitable, useInvite } from '../hives/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { HiveInvitation } from '../ui/HiveInvitation'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { Notice } from '../ui/Notice'
import { SearchField } from '../ui/SearchField'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'

/** Le temps sans frappe après lequel la recherche part (comme la page de recherche). */
const SEARCH_DELAY_MS = 250
/** Les règles de la recherche, celles de l'API (contrat, `INVITABLE_*`). */
const QUERY_MIN = 2
const NETWORK_FROM = 3

/**
 * L'identifiant de l'invitation montrée en aperçu : elle n'existe pas encore, et ses boutons ne font
 * rien (`HiveInvitation mode="preview"`) ; il ne sert qu'à remplir la forme du contrat.
 */
const PREVIEW_ID = '00000000-0000-4000-8000-000000000000'

/** Ce que la ligne d'un membre touché dans cette feuille est devenue. */
type Outcome = 'sent' | 'member'

export function HiveInviteSheet({ id }: { id: string }) {
  const { session } = useMemberSession()
  // Les lectures ne partent qu'avec une session ; sans elle, la page dessous dit quoi faire.
  if (!session) return null
  return <InviteSheet id={id} me={session.user} />
}

type Person = { id: string; name: string }

function InviteSheet({ id, me }: { id: string; me: Person }) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  // Ouverte une fois la page hydratée et tant que l'adresse est la sienne ; fermée, elle revient à
  // la page de la ruche (la page d'avant, ou la ruche après un lien direct).
  const sheet = useRouteSheet(`/hives/${id}`)
  const hive = useHive(id)
  const page = hive.data
  // Le refus de l'API à la dernière invitation, gardé jusqu'à la réponse de l'envoi suivant (rien
  // ne saute au pied de la feuille).
  const [failure, setFailure] = useState<ApiErrorKey | null>(null)

  // Le titre : « Inviter dans Famille » dès que la ruche est lue ; « Inviter » avant.
  const hiveName = page ? (page.summary.name ?? t(($) => $.hives.unnamed)) : null
  const title =
    hiveName === null
      ? t(($) => $.hives.page.invite)
      : t(($) => $.hives.invite.title, { hive: hiveName })

  const notice: SheetNotice | null = failure ? noticeFor(failure) : null
  function noticeFor(key: ApiErrorKey): SheetNotice {
    if (key === 'unauthorized')
      return { message: t(($) => $.states.expired), action: signInAgain() }
    // 404 : un membre inconnu, ou un blocage entre les deux ; l'API ne dit pas lequel.
    if (key === 'notFound') return { message: t(($) => $.hives.invite.notFound) }
    // 403 : l'animateur vient de se réserver les invitations.
    if (key === 'forbidden') return { message: t(($) => $.hives.page.animatorOnly) }
    if (
      key === 'hiveFull' ||
      key === 'alreadyHiveMember' ||
      key === 'rateLimited' ||
      key === 'suspended'
    )
      return { message: t(($) => $.errors[key]) }
    return { message: t(($) => $.hives.invite.error) }
  }

  // Une seule feuille, dont le contenu suit l'état (lecture, introuvable, panne, prête) : la couche
  // ne se ferme et ne se rouvre jamais en changeant d'état.
  let content: ReactNode
  if (page) {
    content = <InviteForm id={id} page={page} me={me} onFailure={setFailure} />
  } else if (hive.error) {
    const key = errorKey(hive.error)
    content =
      key === 'notFound' ? (
        // Pas membre, ou ruche inconnue : la même phrase, qui ne dit pas si la ruche existe.
        <StateMessage kind="notFound" level={2} title={t(($) => $.states.notFoundTitle)} />
      ) : (
        <StateMessage
          kind="error"
          level={2}
          title={t(($) => $.hives.page.loadError)}
          message={key === 'unauthorized' ? t(($) => $.states.expired) : t(($) => $.errors[key])}
          actions={[{ label: t(($) => $.common.retry), onPress: () => void hive.refetch() }]}
        />
      )
  } else {
    content = <StateMessage kind="loading" message={t(($) => $.common.loading)} />
  }

  return (
    <Sheet
      open={sheet.open}
      title={title}
      // La feuille est la page (son adresse) : son titre est celui de la page.
      heading={1}
      // Elle s'ouvre sous le doigt de « Inviter » : la seconde tape d'une double tape ne tombe sur
      // rien de la feuille.
      guardTaps
      notice={notice}
      onClose={sheet.close}
    >
      {content}
    </Sheet>
  )
}

type FormProps = {
  id: string
  page: HivePage
  me: Person
  /** Le refus de la dernière invitation (null : elle est partie). */
  onFailure: (key: ApiErrorKey | null) => void
}

/** La recherche, les résultats, la phrase, et l'aperçu de l'invitation. */
function InviteForm({ id, page, me, onFailure }: FormProps) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  const toSource = useMediaSources()
  const { mutateAsync } = useInvite(id)

  // Ce qui est dans le champ, et ce qui est cherché : le même texte, 250 ms après la dernière
  // lettre. Le minuteur est relancé à chaque frappe ; l'ancien est effacé par le nettoyage de
  // useEffect (la fonction rendue, appelée avant l'effet suivant).
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])
  const search = useInvitable(id, query)

  // Trop court pour chercher (blancs retirés) : on le dit, sans résultats d'avant.
  const typed = text.trim()
  const tooShort = typed.length < QUERY_MIN
  // Les dernières lignes reçues, gardées pendant la lecture suivante : la liste ne disparaît pas
  // entre deux mots, elle change quand la réponse arrive.
  const lastResults = useRef<InvitableMember[] | null>(null)
  if (tooShort) lastResults.current = null
  else if (search.data) lastResults.current = search.data.members
  const results = tooShort ? null : (search.data?.members ?? lastResults.current)
  const searching = !tooShort && (query.trim() !== typed || search.isFetching)
  const searchFailed = !tooShort && !searching && search.isError

  // Les membres touchés dans cette feuille et ce que leur ligne est devenue (« Invitation
  // envoyée » ; « Déjà membre » si l'API l'a dit). Leur bouton reste un bouton jusqu'à la fermeture.
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, Outcome>>(new Map())
  // Les invitations en cours d'envoi : la garde de double tape (lue et posée au toucher), et la roue
  // du bouton touché (l'état, pour redessiner).
  const inFlight = useRef(new Set<string>())
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set())

  const settle = (userId: string, outcome: Outcome | null) => {
    inFlight.current.delete(userId)
    setSending((before) => {
      const next = new Set(before)
      next.delete(userId)
      return next
    })
    if (outcome) setOutcomes((before) => new Map(before).set(userId, outcome))
  }

  const invite = async (member: InvitableMember) => {
    const userId = member.face.id
    if (inFlight.current.has(userId) || outcomes.has(userId)) return
    inFlight.current.add(userId)
    setSending((before) => new Set(before).add(userId))
    try {
      await mutateAsync(userId)
      onFailure(null)
      settle(userId, 'sent')
    } catch (error) {
      const key = errorKey(error)
      // Déjà invité entre-temps (une autre personne de la ruche, un autre onglet) : c'est fait.
      if (key === 'alreadyInvited') {
        onFailure(null)
        settle(userId, 'sent')
        return
      }
      onFailure(key)
      settle(userId, key === 'alreadyHiveMember' ? 'member' : null)
    }
  }

  // Peut-on inviter maintenant ? La ruche pleine ou réservée à l'animateur grise « Inviter ».
  const canInvite = page.invite === 'allowed'
  const placesLeft = Math.max(
    0,
    HIVE_LIMITS.members - page.summary.memberCount - page.pendingInvitations,
  )
  const room =
    page.invite === 'full'
      ? t(($) => $.hives.page.full)
      : page.invite === 'animatorOnly'
        ? t(($) => $.hives.page.animatorOnly)
        : t(($) => $.hives.invite.placesLeft, { count: placesLeft })

  // La ligne lue par les lecteurs d'écran, jamais montrée : « Recherche en cours… », puis « 2 membres
  // trouvés » ou « Aucun membre trouvé. ». Vide quand il n'y a rien à dire (la panne est une alerte).
  const status = tooShort
    ? ''
    : searching
      ? t(($) => $.search.searching)
      : results === null
        ? ''
        : results.length === 0
          ? t(($) => $.hives.invite.empty)
          : t(($) => $.hives.invite.results, { count: results.length })

  // L'aperçu : la carte que recevra le premier membre qu'on peut inviter (« Ce que reçoit Max
  // Durand »), sinon « Ce que reçoit la personne invitée ».
  const next = results?.find((one) => one.state === 'none' && !outcomes.has(one.face.id))
  const previewTitle = next
    ? t(($) => $.hives.invite.previewTitle, { name: next.face.name })
    : t(($) => $.hives.invite.previewTitleAnyone)
  // La date de l'aperçu : maintenant, figée à l'ouverture (« à l'instant »). La feuille ne se dessine
  // qu'une fois la page hydratée : aucun écart avec le pré-rendu.
  const [createdAt] = useState(() => new Date().toISOString())
  const preview: Invitation = {
    id: PREVIEW_ID,
    hive: {
      id: page.summary.id,
      name: page.summary.name,
      icon: page.summary.icon,
      memberCount: page.summary.memberCount,
      animatorName: page.summary.animator?.name ?? null,
    },
    inviter: { id: me.id, name: me.name, avatarUrl: null },
    createdAt,
  }

  const action = (member: InvitableMember) => {
    const outcome = outcomes.get(member.face.id)
    if (outcome) {
      // Le bouton touché, gardé sous la même clé : il dit ce qui s'est passé et ne fait plus rien.
      return (
        <Button
          key="action"
          label={
            outcome === 'sent' ? t(($) => $.hives.invite.sent) : t(($) => $.hives.invite.member)
          }
          variant="secondary"
          size="compact"
          {...(outcome === 'sent' ? { icon: 'paper-plane-tilt' as const } : null)}
          onPress={() => {}}
        />
      )
    }
    if (member.state === 'member') return <StatusPill label={t(($) => $.hives.invite.member)} />
    if (member.state === 'invited') return <StatusPill label={t(($) => $.hives.invite.sent)} />
    return (
      <Button
        key="action"
        label={t(($) => $.hives.invite.invite)}
        spokenLabel={t(($) => $.hives.invite.inviteNamed, { name: member.face.name })}
        size="compact"
        loading={sending.has(member.face.id)}
        disabled={!canInvite}
        focusableWhenDisabled
        onPress={() => void invite(member)}
      />
    )
  }

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <SearchField
          label={t(($) => $.hives.invite.search)}
          placeholder={t(($) => $.hives.invite.searchPlaceholder)}
          value={text}
          onChangeText={setText}
          // Entrée ne fait rien de plus : la feuille cherche pendant qu'on tape.
          onSubmit={() => {}}
        />
        <LiveStatus message={status} visible={false} />

        {tooShort ? (
          <Text variant="callout" tone="muted">
            {t(($) => $.hives.invite.searchHint)}
          </Text>
        ) : searchFailed ? (
          <Notice
            message={searchErrorText(errorKey(search.error), t)}
            action={
              errorKey(search.error) === 'unauthorized'
                ? signInAgain()
                : { label: t(($) => $.common.retry), onPress: () => void search.refetch() }
            }
          />
        ) : results && results.length > 0 ? (
          <ListGroup list>
            {results.map((member) => (
              <ListRow
                key={member.face.id}
                label={member.face.name}
                leading={
                  // Un repère pour l'œil : le nom, juste à côté, dit déjà qui c'est.
                  <Avatar
                    name={member.face.name}
                    source={toSource(member.face.avatarUrl)}
                    label=""
                    size={40}
                  />
                }
                detail={t(($) => $.member.handle, { handle: member.handle })}
                trailing={action(member)}
              />
            ))}
          </ListGroup>
        ) : results ? (
          <Text variant="callout" tone="muted">
            {t(($) => $.hives.invite.empty)}
          </Text>
        ) : null}

        {/* Sous 3 lettres, la recherche ne voit pas tout le réseau : on le dit. */}
        {!tooShort && typed.length < NETWORK_FROM && results ? (
          <Text variant="caption" tone="muted">
            {t(($) => $.hives.invite.shortQuery)}
          </Text>
        ) : null}
      </Stack>

      <Stack gap="xs">
        <Text variant="caption" tone="muted">
          {t(($) => $.hives.invite.phrase)}
        </Text>
        <Text variant="caption" tone="muted">
          {room}
        </Text>
      </Stack>

      <Stack gap="sm">
        <Text variant="caption" weight={600} tone="muted" heading={2}>
          {previewTitle}
        </Text>
        <HiveInvitation
          invitation={preview}
          mode="preview"
          onAccept={() => Promise.resolve()}
          onRefuse={() => Promise.resolve()}
        />
      </Stack>
    </Stack>
  )
}

/** Le message d'une recherche qui n'a pas abouti : la raison quand on la connaît. */
function searchErrorText(key: ApiErrorKey, t: ReturnType<typeof useTranslation>['t']): string {
  if (key === 'unauthorized') return t(($) => $.states.expired)
  if (key === 'rateLimited' || key === 'unavailable') return t(($) => $.errors[key])
  return t(($) => $.hives.invite.searchError)
}
