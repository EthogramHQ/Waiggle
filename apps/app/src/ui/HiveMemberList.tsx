// La liste des membres d'une ruche, dans l'onglet Membres et la colonne de gauche sur ordinateur
// (tranche R10, planches R10-Membres et R10-Ruche-Desktop). Sur le modèle de la liste des testeurs
// (`TestersList`) et de sa ligne (`TesterRow`) :
// - chaque membre : sa photo, son nom, son pseudo ; « Animateur » dans une pastille pour l'animateur,
//   « toi » à côté du pseudo pour soi. La ligne est un lien vers sa page (« Voir la page de Léa
//   Moreau ») ;
// - chez l'animateur (`canRemove`), un bouton « Retirer Tante Odile de la ruche » juste après le lien
//   de chaque autre membre, jamais sur sa propre ligne. Il est posé à côté du lien, jamais dedans (un
//   bouton dans un lien ne se toucherait pas seul). La confirmation appartient à l'écran, qui reçoit
//   le membre par `onRemove` ;
// - un membre « réduit » (il a bloqué l'animateur, choix de Louis du 14/11/2026, Q3) : son nom seul,
//   sans photo, ni pseudo, ni lien ; l'animateur peut toujours le retirer.
//
// Le focus : quand le membre retiré disparaît de la liste reçue (l'écran a confirmé, l'API a
// répondu), le bouton qui avait le focus disparaît avec lui, et le focus retomberait en haut de la
// page. Il va au membre suivant (sinon au précédent), au clavier (web) comme pour le lecteur d'écran
// (téléphone). Rien ne bouge à la première apparition de la liste, ni sans geste.
import { layout, radii, space } from '@ruche/brand'
import type { HiveMember } from '@ruche/contracts'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import { useNameOf } from '../useNameOf'
import { Avatar } from './Avatar'
import { describedBy } from './aria'
import { focusWithoutScroll, moveReaderTo } from './focus'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { ListGroup, ListRow } from './ListGroup'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Les membres, dans l'ordre de l'API : l'animateur d'abord, puis par date d'entrée. */
  members: HiveMember[]
  /** Le lecteur anime la ruche : « Retirer … de la ruche » sur chaque autre membre. */
  canRemove: boolean
  /** Ouvre la page du membre (jamais appelé pour un membre réduit, qui n'a pas de lien). */
  onOpen: (member: HiveMember) => void
  /** Retirer ce membre (l'écran demande d'abord confirmation). */
  onRemove: (member: HiveMember) => void
  /**
   * Fait d'une adresse de photo une source d'image : celle que rend `useMediaSources()`
   * (api/media.ts), donnée par l'écran (`src/ui` ne lit pas l'API). Absent : les initiales.
   */
  toSource?: (url: string | null | undefined) => ImageSource | null
}

/** La photo d'un membre : 40 points, celle de la planche et des autres listes de personnes. */
const AVATAR_SIZE = 40
/**
 * La place que le lien d'un membre demande avant de laisser « Retirer » passer dessous : les marges,
 * la photo, l'écart et une centaine de points pour le nom (comme `TesterRow`).
 */
const LINK_BASIS = 180

export function HiveMemberList({ members, canRemove, onOpen, onRemove, toSource }: Props) {
  // Pour chaque membre montré, la vue qui reçoit le focus quand son voisin part : son lien, ou le
  // bouton « Retirer » d'un membre réduit (qui n'a pas de lien).
  const targets = useRef(new Map<string, View>())
  // Le membre dont on a touché « Retirer » : quand il quitte la liste reçue, son voisin prend le
  // focus. Un autre changement de la liste (une relecture) ne déplace rien.
  const pending = useRef<string | null>(null)
  // La liste d'avant : pour trouver le voisin d'un membre qui n'y est plus.
  const previous = useRef(members)

  // Un effet (useEffect) s'exécute après que React a retiré la ligne partie : les lignes restantes
  // sont toujours là (même clé), on peut y poser le focus.
  useEffect(() => {
    const before = previous.current
    previous.current = members
    const gone = pending.current
    if (gone === null) return
    const present = new Set(members.map((member) => member.face.id))
    if (present.has(gone)) return
    pending.current = null
    const at = before.findIndex((member) => member.face.id === gone)
    if (at === -1) return
    const stays = (member: HiveMember) => present.has(member.face.id)
    // Le suivant d'abord ; le dernier de la liste parti, le précédent.
    const neighbour =
      before.slice(at + 1).find(stays) ?? before.slice(0, at).reverse().find(stays) ?? null
    const node = neighbour ? targets.current.get(neighbour.face.id) : undefined
    if (!node) return
    // Sur le web, le focus du clavier, sans faire défiler la page ; sur téléphone, le lecteur
    // d'écran, qui n'a pas de focus du clavier.
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [members])

  return (
    <ListGroup list>
      {members.map((member) => (
        <MemberRow
          key={member.face.id}
          member={member}
          removable={canRemove && !member.isMe}
          onOpen={onOpen}
          onRemove={(chosen) => {
            pending.current = chosen.face.id
            onRemove(chosen)
          }}
          toSource={toSource}
          targetRef={(node) => {
            if (node) targets.current.set(member.face.id, node)
            else targets.current.delete(member.face.id)
          }}
        />
      ))}
    </ListGroup>
  )
}

type RowProps = {
  member: HiveMember
  removable: boolean
  onOpen: (member: HiveMember) => void
  onRemove: (member: HiveMember) => void
  toSource: Props['toSource']
  targetRef: (node: View | null) => void
}

/** Une ligne : le lien du membre (photo, nom, pseudo, « Animateur »), puis « Retirer ». */
function MemberRow({ member, removable, onOpen, onRemove, toSource, targetRef }: RowProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const nameOf = useNameOf()
  // Une seule garde pour les deux gestes de la ligne (600 ms) : la seconde tape d'une double tape
  // n'ouvre pas deux fois la page, et ne tombe pas sur « Retirer » à côté.
  const guard = useTapGuard()
  // L'identifiant du texte caché qui décrit le lien (web) : le pseudo et « Animateur ».
  const detailId = useId()
  const name = member.face.name
  const handle =
    member.handle === null ? null : t(($) => $.member.handle, { handle: member.handle })
  // Le pseudo seul, pour soi comme pour les autres (la ligne de soi se reconnaît à son nom et sa
  // photo) ; un membre réduit n'a pas de pseudo.
  const detail = member.reduced ? undefined : (handle ?? undefined)
  const animator = member.role === 'animator' ? t(($) => $.hives.page.animator) : null
  const description = [detail, animator].filter(Boolean).join(', ')

  const body = (
    <ListRow
      label={name}
      leading={
        member.reduced ? (
          // Ni sa photo ni ses initiales (Q3) : une silhouette neutre, qui garde le nom aligné sur
          // ceux des autres lignes. Un décor, caché partout.
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              flexShrink: 0,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceGrouped,
            }}
          >
            <Icon name="user" size={20} tone="muted" />
          </View>
        ) : (
          // Décorative : le nom, écrit juste à côté, dit déjà de qui il s'agit. Cachée partout (web,
          // iOS, Android) : sans cela, ses initiales se lisaient dans le lien (« img PJ »).
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexShrink: 0 }}
          >
            <Avatar
              name={name}
              source={toSource ? toSource(member.face.avatarUrl) : null}
              label=""
              size={AVATAR_SIZE}
            />
          </View>
        )
      }
      {...(detail ? { detail } : null)}
      {...(animator ? { trailing: <StatusPill label={animator} /> } : null)}
    />
  )

  const open = guard(() => onOpen(member))
  const link = member.reduced ? (
    body
  ) : (
    // Le lien de la ligne, nommé « Voir la page de Léa Moreau » ; le pseudo et « Animateur », qu'il
    // contient, le décrivent (le nom d'un lien cache le texte qu'il contient). Comme une ligne
    // touchable de `ListRow` : le fond s'assombrit sous le doigt, l'anneau du clavier se dessine à
    // l'intérieur (le groupe rogne ce qui dépasse).
    <Pressable
      ref={targetRef}
      accessibilityRole="link"
      accessibilityLabel={t(($) => $.member.open, { nameOf: nameOf(name) })}
      accessibilityHint={Platform.OS === 'web' || !description ? undefined : description}
      {...describedBy(Platform.OS === 'web' && description ? detailId : undefined)}
      // Entrée ouvre la page sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(open)}
      onPress={open}
      {...insetFocus}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceGrouped } : null)}
    >
      {body}
      {Platform.OS === 'web' && description ? (
        // La description, cachée à l'œil (display: none) mais lue par aria-describedby.
        <View nativeID={detailId} style={{ display: 'none' }}>
          <Text>{description}</Text>
        </View>
      ) : null}
    </Pressable>
  )

  return (
    // Une rangée qui passe à la ligne : à 200 % de texte sur 320 points, « Retirer » passe sous le
    // nom au lieu de l'écraser en une lettre par ligne.
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingRight: removable ? space.sm : 0,
      }}
    >
      {/* Pas `flex: 1` (base nulle, qui ne passe jamais à la ligne) : une base réelle, puis toute
          la place qui reste. */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: LINK_BASIS, minWidth: 0 }}>{link}</View>
      {removable ? (
        // Rangé à droite, sur la ligne du nom comme sous elle (marge automatique) ; 44 points à
        // toucher. Un membre réduit n'a pas de lien : c'est lui qui reçoit le focus de la ligne.
        <View style={{ flexShrink: 0, marginLeft: 'auto', minHeight: layout.touchTarget }}>
          <IconButton
            icon="user-minus"
            variant="bare"
            label={t(($) => $.hives.page.removeNamed, { name })}
            onPress={guard(() => onRemove(member))}
            {...(member.reduced ? { ref: targetRef } : null)}
          />
        </View>
      ) : null}
    </View>
  )
}
