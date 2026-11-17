// La liste « Proches à suivre » (R4), seule liste des suggestions : au premier lancement (FirstRun)
// comme dans la colonne de droite du Fil sur ordinateur (FeedSide). Elle dessine le titre, la
// légende qui dit le critère (« Des membres qui ont publié récemment », jur-J5) et les lignes
// (SuggestionRow) dans un groupe, et elle garde tout ce qui se passe après un « × » :
// - la ligne part tout de suite, et la suivante monte à sa place (ou un autre membre entre, si la
//   liste en a plus que `max`) ;
// - une seule garde pour toutes les lignes (TAP_GUARD_MS) : la seconde tape d'une double tape tombe
//   sur le « × » de la ligne qui vient de monter sous le doigt, et ne l'écarte pas (ui-B7) ;
// - le focus du clavier passe au « × » de la ligne suivante, au lieu de retomber en haut de page ;
// - « Tu ne verras plus Léa ici. » et « Annuler » pendant 5 secondes ; l'écart n'est envoyé qu'à la
//   fin de ce délai, ou plus tôt si le membre quitte la page (jur-J8, décision du 31/10/2026) ; le
//   délai s'arrête tant que « Annuler » a le focus ou la souris (relecture design C2, WCAG 2.2.1) ;
// - au clavier, « Annuler » est à un Tab du « × » qui a reçu le focus (useTabAfter) ;
// - si l'envoi échoue, la ligne revient, avec un message.
//
// Le message et « Annuler » sont posés sous le groupe, pas dans un toast : un toast ne porte jamais
// d'action (WCAG 2.2.1, theme/toast.tsx), et « Annuler » doit rester là le temps qu'on l'atteigne
// au clavier. La ligne du message garde sa place une fois posée (le texte reste, seul « Annuler »
// part) : ce qui est dessous ne remonte pas tout seul, sans geste du membre.
import { layout, space } from '@ruche/brand'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, View } from 'react-native'
import { focusWithoutScroll } from './focus'
import type { ImageSource } from './image'
import { ListGroup, TextLineShape } from './ListGroup'
import { LiveStatus } from './LiveStatus'
import { Notice } from './Notice'
import type { CoverImage } from './ProjectCover'
import { Loading, Shape } from './Skeleton'
import { SuggestionRow } from './SuggestionRow'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTabAfter } from './tabOrder'
import { useTapGuard } from './tapGuard'

/** Le temps pendant lequel « Annuler » est proposé après « × » (jur-J8). */
export const UNDO_MS = 5_000

/** Un membre suggéré, tel que la liste le dessine. */
export type SuggestedMemberRow = {
  id: string
  name: string
  avatar: ImageSource | null
  project: { title: string; image: CoverImage | null }
  followed: boolean
}

type Props = {
  members: readonly SuggestedMemberRow[]
  /** Le nombre de lignes montrées : 5 au premier lancement, 3 dans la colonne de droite. */
  max?: number
  onFollow: (id: string) => void
  onOpenMember: (id: string) => void
  onOpenProject: (id: string) => void
  /** Envoie l'écart ; `ok` faux si l'API l'a refusé (réseau, quota) : la ligne revient alors. */
  onDismiss: (id: string) => Promise<{ ok: boolean }>
  /** « Suivre » inactif, à sa place, sur chaque ligne (un compte suspendu). */
  followDisabled?: boolean
  /** Les lignes empilées, pour une colonne étroite (la colonne de droite du Fil : SuggestionRow). */
  stacked?: boolean
  /**
   * Un message à la place des lignes (la lecture a échoué, avec « Réessayer ») : le titre de la
   * section reste au-dessus, pour qu'on sache de quoi parle le message (relecture design A8).
   */
  notice?: ReactNode
}

/** Ce que dit la ligne sous le groupe : rien, l'écart d'un membre, ou l'échec d'un envoi. */
type Said = { kind: 'dismissed'; name: string } | { kind: 'error' } | null

export function SuggestionList({
  members,
  max = 5,
  onFollow,
  onOpenMember,
  onOpenProject,
  onDismiss,
  followDisabled = false,
  stacked = false,
  notice,
}: Props) {
  const { t } = useTranslation()
  // Les membres retirés de la liste : celui dont l'écart attend la fin des 5 secondes, et ceux dont
  // l'écart est parti (la liste de l'API les retire à sa prochaine lecture).
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  // L'écart qui attend : « Annuler » n'est proposé que pour lui.
  const [pending, setPending] = useState<string | null>(null)
  const [said, setSaid] = useState<Said>(null)
  // Où poser le focus après le prochain rendu : l'identifiant d'une ligne, ou « undo ».
  const [focusTarget, setFocusTarget] = useState<{ to: string } | null>(null)

  // Les refs : des valeurs gardées d'un rendu à l'autre sans redessiner. Les minuteurs et la
  // fonction d'envoi y vivent pour que le départ de la page (plus bas) lise toujours les derniers.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<string | null>(null)
  const mounted = useRef(true)
  const send = useRef(onDismiss)
  send.current = onDismiss
  // Le « × » de chaque ligne, pour y poser le focus ; et « Annuler ».
  const dismissNodes = useRef(new Map<string, View>())
  const undoNode = useRef<View>(null)
  // La garde commune à toutes les lignes (et à « Annuler », qui peut monter sous le doigt quand la
  // dernière ligne part).
  const guard = useTapGuard()
  // Le délai s'arrête tant que « Annuler » a le focus du clavier ou la souris dessus (relecture
  // design C2, WCAG 2.2.1 : on ne retire pas une action à quelqu'un qui s'apprête à la toucher). On
  // garde l'heure prévue de l'envoi, pour reprendre, ensuite, avec le temps qui restait.
  const deadline = useRef(0)
  const remaining = useRef(UNDO_MS)
  const held = useRef({ focus: false, hover: false })
  // La ligne dont le « × » a reçu le focus après un écart : pour le clavier, « Annuler » la suit
  // (useTabAfter), au lieu d'attendre au bout de la liste, à treize Tab de là.
  const anchorId = useRef<string | null>(null)

  const shown = members.filter((member) => !hidden.has(member.id)).slice(0, max)
  // La première ligne montrée, lue par le minuteur (posé lors d'un rendu plus ancien).
  const firstShown = useRef<string | undefined>(undefined)
  firstShown.current = shown[0]?.id

  /** Lance (ou relance) le compte à rebours de l'écart en attente. */
  const countDown = (ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    deadline.current = Date.now() + ms
    timer.current = setTimeout(flush, ms)
  }

  /** « Annuler » prend ou perd le focus, ou la souris : le délai s'arrête, ou repart. */
  const hold = (kind: 'focus' | 'hover', on: boolean) => {
    const before = held.current.focus || held.current.hover
    held.current = { ...held.current, [kind]: on }
    const after = held.current.focus || held.current.hover
    if (pendingRef.current === null || before === after) return
    if (after) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      remaining.current = Math.max(0, deadline.current - Date.now())
    } else {
      countDown(remaining.current)
    }
  }

  /** Envoie l'écart en attente, s'il y en a un (fin du délai, nouvel écart, départ de la page). */
  const flush = () => {
    const id = pendingRef.current
    if (id === null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingRef.current = null
    anchorId.current = null
    // « Annuler » va disparaître sans toujours dire qu'il perd le focus ou la souris.
    held.current = { focus: false, hover: false }
    if (mounted.current) {
      // « Annuler » va disparaître : s'il avait le focus du clavier (on l'a atteint par Tab sans
      // le toucher), le focus passe à la première ligne au lieu de retomber en haut de la page.
      if (hasFocus(undoNode.current) && firstShown.current) {
        setFocusTarget({ to: firstShown.current })
      }
      setPending(null)
    }
    void send.current(id).then(
      (result) => {
        if (!result.ok) restore(id)
      },
      () => restore(id),
    )
  }

  /** L'envoi a échoué : la ligne revient, et la ligne du message le dit. */
  const restore = (id: string) => {
    if (!mounted.current) return
    setHidden((current) => without(current, id))
    setSaid({ kind: 'error' })
  }

  const dismiss = (member: SuggestedMemberRow) => {
    // Un écart encore en attente part maintenant : « Annuler » ne vaut que pour le dernier.
    flush()
    const index = shown.findIndex((row) => row.id === member.id)
    // La ligne qui prendra la place de celle-ci (la suivante, ou un membre de plus), sinon la
    // précédente ; s'il n'en reste aucune, « Annuler ».
    const after = members.filter((row) => !hidden.has(row.id) && row.id !== member.id)
    const next = after.slice(0, max)[index] ?? after.slice(0, max)[index - 1]
    setHidden((current) => new Set(current).add(member.id))
    pendingRef.current = member.id
    setPending(member.id)
    setSaid({ kind: 'dismissed', name: member.name })
    setFocusTarget({ to: next?.id ?? 'undo' })
    anchorId.current = next?.id ?? null
    countDown(UNDO_MS)
  }

  const undo = () => {
    const id = pendingRef.current
    if (id === null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingRef.current = null
    anchorId.current = null
    held.current = { focus: false, hover: false }
    setPending(null)
    setHidden((current) => without(current, id))
    setSaid(null)
    // « Annuler » disparaît : le focus va au « × » de la ligne revenue.
    setFocusTarget({ to: id })
  }

  // Le focus, une fois la page redessinée (la ligne retirée, ou revenue) : sur le web seulement
  // (focusWithoutScroll ne fait rien ailleurs), et sans faire défiler la page.
  useEffect(() => {
    if (!focusTarget) return
    const node =
      focusTarget.to === 'undo' ? undoNode.current : dismissNodes.current.get(focusTarget.to)
    focusWithoutScroll(node)
  }, [focusTarget])

  // Au clavier, pendant que l'écart attend : « × » de la ligne montée, Tab, « Annuler », Tab, la
  // suite de la liste (web seulement ; rien ne bouge à l'écran, voir tabOrder.ts).
  useTabAfter(
    () => (anchorId.current ? dismissNodes.current.get(anchorId.current) : null),
    () => undoNode.current,
    pending !== null,
  )

  // Le départ de la page : l'écart en attente part tout de suite (jur-J8). À la sortie du composant
  // (une autre page remplace celle-ci), et quand l'appli passe en arrière-plan ou que l'onglet est
  // caché (AppState suit aussi la visibilité de la page sur le web) : une page qu'on ferme ne
  // laisse pas toujours le temps à un minuteur.
  // biome-ignore lint/correctness/useExhaustiveDependencies: flush lit tout par des refs ; l'effet ne se pose qu'une fois
  useEffect(() => {
    mounted.current = true
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush()
    })
    return () => {
      subscription.remove()
      mounted.current = false
      flush()
    }
  }, [])

  const message =
    said?.kind === 'dismissed' ? t(($) => $.suggestions.dismissed, { name: said.name }) : ''

  return (
    <View style={{ gap: space.md }}>
      {/* Le titre de la section, seul : d'où viennent les suggestions est dit dans les Règles. */}
      <Text variant="heading" heading={2}>
        {t(($) => $.suggestions.title)}
      </Text>
      {notice ? (
        notice
      ) : shown.length > 0 ? (
        <ListGroup>
          {shown.map((member) => (
            // La clé est l'identifiant : la ligne de Sam qui monte reste la même ligne (son focus,
            // sa garde), au lieu d'être redessinée à la place de celle de Léa.
            <SuggestionRow
              key={member.id}
              name={member.name}
              avatar={member.avatar}
              project={member.project}
              followed={member.followed}
              followDisabled={followDisabled}
              stacked={stacked}
              onFollow={() => onFollow(member.id)}
              onOpenMember={() => onOpenMember(member.id)}
              onOpenProject={() => onOpenProject(member.id)}
              onDismiss={guard(() => dismiss(member))}
              dismissRef={(node) => {
                if (node) dismissNodes.current.set(member.id, node)
                else dismissNodes.current.delete(member.id)
              }}
            />
          ))}
        </ListGroup>
      ) : null}
      <SaidLine visible={said !== null}>
        {said?.kind === 'error' ? (
          // Toute la largeur de la ligne : le cadre de l'alerte ne se serre pas contre son texte.
          <View style={{ flexBasis: '100%' }}>
            <Notice message={t(($) => $.suggestions.dismissError)} />
          </View>
        ) : null}
        {/* Toujours montée, vide plutôt qu'absente : un lecteur d'écran n'annonce que ce qui
            change dans une région qu'il connaît déjà. */}
        <LiveStatus message={message} />
        {pending ? (
          <TextLink
            label={t(($) => $.suggestions.undo)}
            role="button"
            onPress={guard(undo)}
            ref={undoNode}
            onFocus={() => hold('focus', true)}
            onBlur={() => hold('focus', false)}
            onHoverIn={() => hold('hover', true)}
            onHoverOut={() => hold('hover', false)}
          />
        ) : null}
      </SaidLine>
    </View>
  )
}

/**
 * R16 (« Les squelettes », scénario : « Proches à suivre » garde sa hauteur pendant qu'elle charge) :
 * la section qui charge. Son vrai titre, lisible hors du « Chargement… » (une zone `progressbar` n'a
 * qu'un nom : un titre dedans ne serait plus lu), puis, sous un seul `Loading`, autant de lignes
 * vides que la liste en montrera (`count`), dans le groupe blanc d'une vraie liste.
 *
 * `shown` : les lignes vides se montrent tout de suite, sans les 160 ms d'attente de `Loading`
 * (elles prennent la suite d'un squelette déjà vu).
 */
export function SuggestionListSkeleton({
  count,
  stacked = false,
  shown = false,
}: {
  count: number
  stacked?: boolean
  shown?: boolean
}) {
  const { t } = useTranslation()
  return (
    <View style={{ gap: space.md }}>
      <Text variant="heading" heading={2}>
        {t(($) => $.suggestions.title)}
      </Text>
      <Loading shown={shown}>
        <ListGroup>
          {Array.from({ length: count }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
            <SuggestionRowSkeleton key={index} stacked={stacked} />
          ))}
        </ListGroup>
      </Loading>
    </View>
  )
}

// Les mesures de `SuggestionRow`, que sa ligne vide reprend. Ce qui fait la hauteur d'une ligne, ce
// sont ses zones de 44 points (photo, nom, projet, boutons : `layout.touchTarget`) et ses marges,
// lues ici aux mêmes jetons ; les formes posées dedans (rond de 40, vignette de 16) ne la changent pas.
/** La photo du membre, dans sa zone de 44. */
const ROW_AVATAR = 40
/** La vignette du projet, à la taille d'une ligne de texte. */
const ROW_THUMBNAIL = 16
/** La largeur sous laquelle « Suivre » passe sous le nom, en rangée. */
const ROW_NAME_BASIS = 88
/** Empilé : le projet et les boutons commencent sous le nom, après la photo. */
const ROW_TEXT_INSET = layout.touchTarget + space.sm
/** La pastille de « Suivre ». */
const ROW_FOLLOW_WIDTH = 72

/**
 * R16 : la ligne vide d'une suggestion, à la hauteur d'une vraie (`SuggestionRow`) : en rangée
 * (premier lancement), deux zones de 44 l'une sur l'autre, la photo à gauche et « Suivre » à
 * droite ; empilée (la colonne du Fil), trois zones de 44 : la photo et le nom, le projet, puis
 * « Suivre » et « × ». À poser dans un `ListGroup`, sous un `Loading`.
 *
 * Ni rôle ni nom : c'est le `Loading` de la zone qui dit « Chargement… », une fois pour toutes ses
 * lignes.
 */
export function SuggestionRowSkeleton({ stacked = false }: { stacked?: boolean }) {
  const photo = (
    <View
      style={{
        width: layout.touchTarget,
        height: layout.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Shape height={ROW_AVATAR} width={ROW_AVATAR} round />
    </View>
  )
  const project = (
    <View
      style={{
        minHeight: layout.touchTarget,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.sm,
        paddingTop: stacked ? space.sm : space.xxs,
      }}
    >
      <View style={{ marginTop: space.xxs }}>
        <Shape height={ROW_THUMBNAIL} width={ROW_THUMBNAIL} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1 }}>
        <TextLineShape variant="callout" width="70%" />
      </View>
    </View>
  )
  const follow = <Shape height={layout.controlHeight.small} width={ROW_FOLLOW_WIDTH} round />
  // La place du « × », vide : il n'y a rien à écarter.
  const dismiss = <View style={{ width: layout.touchTarget, height: layout.touchTarget }} />

  if (stacked) {
    return (
      <View style={{ paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {photo}
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
            <TextLineShape variant="body" width="60%" />
          </View>
        </View>
        <View style={{ paddingLeft: ROW_TEXT_INSET }}>{project}</View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingLeft: ROW_TEXT_INSET,
          }}
        >
          {follow}
          <View style={{ marginLeft: 'auto' }}>{dismiss}</View>
        </View>
      </View>
    )
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingLeft: space.lg,
        paddingRight: space.sm,
        paddingVertical: space.xs,
      }}
    >
      {photo}
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
        }}
      >
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: ROW_NAME_BASIS, minWidth: 0 }}>
          <View style={{ minHeight: layout.touchTarget, justifyContent: 'flex-end' }}>
            <TextLineShape variant="body" width="55%" />
          </View>
          {project}
        </View>
        {follow}
      </View>
      {dismiss}
    </View>
  )
}

/**
 * Vrai si `node` a le focus du clavier. Sur le web, la ref d'une vue est l'élément de la page ;
 * ailleurs (téléphone, tests), il n'y a pas de page, donc pas de focus du clavier à suivre.
 */
const hasFocus = (node: unknown): boolean =>
  node !== null && typeof document !== 'undefined' && document.activeElement === node

/** Une copie de l'ensemble, sans `id`. */
const without = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const copy = new Set(set)
  copy.delete(id)
  return copy
}

/**
 * La ligne du message, sous le groupe. Une fois posée, elle garde au moins la hauteur d'un bouton,
 * qu'« Annuler » soit là ou non : son départ, à la fin des 5 secondes, ne fait rien remonter.
 */
function SaidLine({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space.md,
        ...(visible ? { minHeight: layout.touchTarget } : null),
      }}
    >
      {children}
    </View>
  )
}
