// La frise des mises à jour d'un projet (R7a, scénario « La frise », planches R7-MAJ-Projet et
// R7-MAJ-Desktop) : les mises à jour de la plus récente à la plus ancienne, chacune en entier
// (`UpdateEntry`, titre de niveau 2), reliées par un trait à gauche ; un point miel pour la plus
// récente, un rond vide pour les autres. Puis « Afficher la suite » tant qu'il en reste (`FeedEnd`,
// le bas commun des listes : pas de défilement sans fin), et, tout en bas, « Première version », à la
// date de publication du projet, seulement quand il n'y a plus de suite (relecture du plan, A4).
//
// Le focus du clavier ne se perd jamais (relecture du plan, A4) :
// - après « Afficher la suite », il va au titre de la première mise à jour arrivée (`FeedEnd` et
//   `useFirstArrived`, comme les autres listes par pages) ;
// - après une suppression, au titre de la mise à jour qui suivait, sinon de celle d'avant.
// Une panne de la suite garde ce qui est affiché, dit `project.updates.moreError` et propose
// « Réessayer », qui redemande la page (`onMore`).
//
// Le composant ne parle jamais à l'API (règle des étages) : l'écran lui donne les mises à jour,
// `toSource` (la fonction de `useMediaSources()`) et les gestes (supprimer, signaler, la suite).
import { space } from '@ruche/brand'
import type { ProjectUpdate } from '@ruche/contracts'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { FeedEnd, useFirstArrived } from './FeedEnd'
import { type Focusable, focusWithoutScroll, moveReaderTo } from './focus'
import type { ImageSource } from './image'
import { RelativeTime } from './RelativeTime'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'
import { UpdateEntry } from './UpdateEntry'

type Props = {
  /** Les mises à jour affichées, de la plus récente à la plus ancienne (les pages déjà lues). */
  updates: ProjectUpdate[]
  /** La date de publication du projet : celle de « Première version », au bout de la frise. */
  publishedAt: string
  /** Fait d'une adresse de photo une source d'image : celle de `useMediaSources()` (api/media.ts). */
  toSource: (url: string | null | undefined) => ImageSource | null
  /** Pour l'auteur : la corbeille de chaque mise à jour (l'écran ouvre la confirmation). */
  onDelete?: (update: ProjectUpdate) => void
  /** La mise à jour en cours de suppression : sa corbeille est occupée et ignore une autre tape. */
  deletingId?: string | null
  /** Pour un autre membre : « Signaler cette mise à jour ». Jamais avec `onDelete`. */
  onReport?: (update: ProjectUpdate) => void
  /** Il reste des mises à jour plus anciennes à lire. */
  hasMore: boolean
  /** Demande la page suivante (« Afficher la suite », puis « Réessayer » après une panne). */
  onMore: () => void
  /** La page suivante arrive : le bouton est occupé et ne redemande rien. */
  loadingMore: boolean
  /** La page suivante n'a pas pu se charger : le message, et « Réessayer ». */
  moreError?: boolean
  /** L'heure qu'il est, pour figer les dates relatives (catalogue, tests). */
  now?: Date
}

/** Le diamètre d'un rond de la frise. */
const DOT = 12
/** La largeur de la colonne de la frise : le rond, et un peu d'air autour du trait. */
const RAIL = space.xl
/** L'épaisseur du trait qui relie les ronds. */
const TRAIL = 2
/**
 * Ce qui précède la première ligne du titre dans `UpdateEntry` : avec une corbeille ou « Signaler »,
 * le titre descend pour se centrer sur le bouton de 44 points (`space.sm`, voir `UpdateEntry`) ; le
 * rond descend avec lui.
 */
const titleOffset = (withButton: boolean) => (withButton ? space.sm : 0)
/**
 * Un blanc insécable : le texte invisible qui donne à la case du rond la hauteur d'une ligne du
 * titre. Écrit par son numéro (un caractère invisible dans le source ne se relit pas).
 */
const LINE_FILLER = String.fromCodePoint(0x00a0)

export function UpdateTimeline({
  updates,
  publishedAt,
  toSource,
  onDelete,
  deletingId = null,
  onReport,
  hasMore,
  onMore,
  loadingMore,
  moreError = false,
  now,
}: Props) {
  const { t } = useTranslation()
  // Le bas de la frise, dans l'ordre des autres listes : la suite qui arrive passe avant la panne
  // (« Réessayer » montre alors son chargement), puis la suite à demander, puis la fin.
  const state = loadingMore ? 'loading' : moreError ? 'error' : hasMore ? 'more' : 'end'

  // La première mise à jour arrivée avec la dernière page : son titre reçoit le focus quand
  // « Afficher la suite » disparaît (FeedEnd).
  const arrived = useFirstArrived(updates.length, loadingMore)
  // Le titre de chaque mise à jour affichée, par identifiant : où poser le focus après une
  // suppression. Une `Map` dans un `useRef` : une mémoire qui survit aux affichages sans en provoquer.
  const titles = useRef(new Map<string, Focusable>())
  // La mise à jour dont on a touché la corbeille, et sa place : quand elle quitte la frise (la
  // suppression a réussi), le focus va à celle qui a pris sa place, sinon à celle d'avant.
  const removing = useRef<{ id: string; index: number } | null>(null)

  useEffect(() => {
    const pending = removing.current
    if (!pending || updates.some((one) => one.id === pending.id)) return
    removing.current = null
    const next = updates[pending.index] ?? updates[pending.index - 1]
    const title = next ? titles.current.get(next.id) : undefined
    if (!title) return
    // Web : le focus du clavier, sans faire défiler la page. Téléphone : le lecteur d'écran.
    if (!focusWithoutScroll(title)) moveReaderTo(title)
  }, [updates])

  // La suppression a échoué (la corbeille n'est plus occupée et la mise à jour est toujours là) : on
  // oublie la place notée, pour qu'un départ plus tard (une relecture) ne déplace pas le focus.
  const lastDeleting = useRef(deletingId)
  useEffect(() => {
    const was = lastDeleting.current
    lastDeleting.current = deletingId
    if (was && was !== deletingId && removing.current?.id === was) {
      if (updates.some((one) => one.id === was)) removing.current = null
    }
  }, [deletingId, updates])

  /** Une `ref` de rappel : note le titre de la mise à jour, et le donne à FeedEnd s'il est arrivé le premier. */
  const titleRef = (id: string, index: number) => (node: Focusable | null) => {
    if (node) titles.current.set(id, node)
    else titles.current.delete(id)
    if (index === arrived.index) arrived.ref.current = node
  }

  const end = state === 'end'
  return (
    <View style={{ alignSelf: 'stretch' }}>
      {/* role « list » : les lecteurs d'écran annoncent une liste et son nombre de mises à jour. */}
      <View role="list">
        {updates.map((update, index) => {
          const withButton = Boolean(onDelete ?? onReport)
          return (
            <View
              key={update.id}
              role="listitem"
              style={{ flexDirection: 'row', alignItems: 'stretch', gap: space.md }}
            >
              <Rail
                offset={titleOffset(withButton)}
                line="headline"
                dot={index === 0 ? 'latest' : 'past'}
                above={index > 0}
                // Le trait continue sous la dernière mise à jour quand il en reste (il mène à
                // « Afficher la suite ») ou quand « Première version » ferme la frise.
                below={index < updates.length - 1 || end || hasMore}
              />
              <View style={{ flex: 1, minWidth: 0, paddingBottom: space.xxl }}>
                <UpdateEntry
                  update={update}
                  toSource={toSource}
                  headingLevel={2}
                  focusRef={titleRef(update.id, index)}
                  deleting={deletingId === update.id}
                  now={now}
                  {...(onDelete
                    ? {
                        onDelete: () => {
                          removing.current = { id: update.id, index }
                          onDelete(update)
                        },
                      }
                    : onReport
                      ? { onReport: () => onReport(update) }
                      : null)}
                />
              </View>
            </View>
          )
        })}
      </View>
      {end ? (
        <FirstVersion publishedAt={publishedAt} now={now} first={updates.length === 0} />
      ) : null}
      <FeedEnd
        state={state}
        moreLabel={t(($) => $.project.updates.more)}
        errorLabel={t(($) => $.project.updates.moreError)}
        retryLabel={t(($) => $.common.retry)}
        onMore={onMore}
        firstArrived={arrived.ref}
      />
    </View>
  )
}

/**
 * La colonne de la frise à gauche d'une mise à jour : le rond à la hauteur du titre, le trait au-dessus
 * (depuis la mise à jour d'avant) et en dessous (vers la suivante). Un décor : le lecteur d'écran le
 * saute (l'ordre se lit dans la liste).
 */
function Rail({
  offset,
  line,
  dot,
  above,
  below,
}: {
  /** Ce qui précède la première ligne du texte d'en face (le titre descendu près d'un bouton). */
  offset: number
  /** Le rôle de texte de cette première ligne : la case du rond en prend la hauteur. */
  line: 'headline' | 'body'
  dot: 'latest' | 'past'
  above: boolean
  below: boolean
}) {
  const { colors } = useTheme()
  // Un bout de trait ; caché (transparent) là où la frise commence ou s'arrête, pour que le rond
  // garde sa place.
  const segment = (shown: boolean, grow: boolean) => (
    <View
      style={{
        width: TRAIL,
        ...(grow ? { flexGrow: 1 } : { height: offset }),
        backgroundColor: shown ? colors.lineStrong : 'transparent',
      }}
    />
  )
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: RAIL, flexShrink: 0, alignItems: 'center' }}
    >
      {segment(above, false)}
      {/* La case du rond : la hauteur d'une ligne du texte d'en face, donnée par un texte invisible
          du même rôle. Avec le texte agrandi, la ligne grandit, et le rond reste en son milieu. */}
      <View style={{ alignSelf: 'stretch' }}>
        <View style={{ opacity: 0 }}>
          <Text variant={line}>{LINE_FILLER}</Text>
        </View>
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: 'center',
          }}
        >
          {segment(above, true)}
          <View
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              borderWidth: TRAIL,
              // La plus récente : le point miel, cerclé du brun des contrôles choisis (le miel seul
              // se perdrait sur une page claire). Les autres : un rond vide, du gris des bords de
              // contrôle.
              borderColor: dot === 'latest' ? colors.controlChecked : colors.controlBorder,
              backgroundColor: dot === 'latest' ? colors.honey : 'transparent',
            }}
          />
          {segment(below, true)}
        </View>
      </View>
      {segment(below, true)}
    </View>
  )
}

/**
 * Le bout de la frise : « Première version », à la date de publication du projet (la date courte à
 * voir, la date complète à lire, comme partout). Le trait y arrive d'en haut, sauf si la frise est
 * vide (`first`).
 */
function FirstVersion({
  publishedAt,
  now,
  first,
}: {
  publishedAt: string
  now?: Date
  first: boolean
}) {
  const { t } = useTranslation()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: space.md,
        paddingBottom: space.md,
      }}
    >
      {/* Le rond au milieu de la ligne « Première version » (un texte courant, sans bouton). */}
      <Rail offset={0} line="body" dot="past" above={!first} below={false} />
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        <Text weight={600} breakAnywhere>
          {t(($) => $.project.updates.firstVersion)}
        </Text>
        <RelativeTime date={publishedAt} now={now} />
      </View>
    </View>
  )
}
