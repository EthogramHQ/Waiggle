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
//   fin de ce délai, ou plus tôt si le membre quitte la page (jur-J8, décision du 31/10/2026) ;
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
import { ListGroup } from './ListGroup'
import { LiveStatus } from './LiveStatus'
import { Notice } from './Notice'
import type { CoverImage } from './ProjectCover'
import { SuggestionRow } from './SuggestionRow'
import { Text } from './Text'
import { TextLink } from './TextLink'
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

  const shown = members.filter((member) => !hidden.has(member.id)).slice(0, max)
  // La première ligne montrée, lue par le minuteur (posé lors d'un rendu plus ancien).
  const firstShown = useRef<string | undefined>(undefined)
  firstShown.current = shown[0]?.id

  /** Envoie l'écart en attente, s'il y en a un (fin du délai, nouvel écart, départ de la page). */
  const flush = () => {
    const id = pendingRef.current
    if (id === null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingRef.current = null
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
    timer.current = setTimeout(flush, UNDO_MS)
  }

  const undo = () => {
    const id = pendingRef.current
    if (id === null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingRef.current = null
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
      {/* Le titre de la section et, à côté (dessous quand la place manque), le critère. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: space.md,
          rowGap: space.xxs,
        }}
      >
        <Text variant="heading" heading={2}>
          {t(($) => $.suggestions.title)}
        </Text>
        <Text variant="caption" tone="muted">
          {t(($) => $.suggestions.caption)}
        </Text>
      </View>
      {shown.length > 0 ? (
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
          />
        ) : null}
      </SaidLine>
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
