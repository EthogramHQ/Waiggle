// Le journal d'un projet (tranche 4b) : ses notes, de la plus récente à la plus ancienne, sur une
// ligne de temps (un point de miel par note, reliés par un trait). Chaque note montre sa date et
// son texte, brut, tel qu'écrit. Pour l'auteur, un bouton « Supprimer la note » par note (l'écran
// demande confirmation). Sans note, le message donné par l'écran, ou rien du tout.
//
// Les boutons de suppression portent tous le même nom ; sur le web, chacun est en plus « décrit »
// par le texte de sa note (aria-describedby) : le lecteur d'écran dit laquelle il supprime.
// Quand une note disparaît, l'écran peut ramener le focus du clavier sur sa voisine (handle).
//
// Tranche 6d : pour un autre membre, un drapeau « Signaler cette note » par note (`onReport`),
// décrit de la même façon par son texte. Pour l'auteur, une note retirée par la modération garde sa
// place, avec le bandeau du retrait au-dessus de son texte (`removed`).
import { borders, layout, radii, readableWidth, space, textStyles } from '@ruche/brand'
import { type Ref, useId, useImperativeHandle, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import { focusWithoutScroll } from './focus'
import { IconButton } from './IconButton'
import { RemovalNotice, type RemovedBanner } from './RemovalNotice'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Note = {
  id: string
  body: string
  when: string
  /** Le bandeau d'une note retirée par la modération, pour l'auteur (tranche 6d). */
  removed?: RemovedBanner | undefined
}

/**
 * Ce qu'un écran peut demander au journal : poser le focus sur le bouton « Supprimer » de la note
 * à cette place (celle qui a pris la place d'une note supprimée), ou de la dernière s'il n'y en a
 * plus autant ; sans note, sur le message du journal vide.
 */
export type NoteListHandle = { focusAt: (index: number) => void }

type Props = {
  notes: Note[]
  /** Pour l'auteur : supprimer une note (l'écran demande d'abord confirmation). */
  onDelete?: (id: string) => void
  /** Le nom des boutons de suppression (par défaut, « Supprimer la note »). */
  deleteLabel?: string
  /** Pour un autre membre : signaler une note (l'écran ouvre la page « Signaler »). */
  onReport?: (id: string) => void
  /** Le nom des boutons de signalement (par défaut, « Signaler cette note »). */
  reportLabel?: string
  /** Le message d'un journal vide ; sans lui, un journal vide n'affiche rien. */
  empty?: string
  handle?: Ref<NoteListHandle>
}

// Le point de chaque note sur la ligne de temps.
const DOT = 10

export function NoteList({
  notes,
  onDelete,
  deleteLabel,
  onReport,
  reportLabel,
  empty,
  handle,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Un préfixe unique pour les identifiants des textes (aria-describedby), stable entre le
  // pré-rendu web et le navigateur.
  const prefix = useId()
  const buttons = useRef(new Map<string, View | null>())
  const emptyRef = useRef<View>(null)
  useImperativeHandle(handle, () => ({
    focusAt: (index: number) => {
      const note = notes[Math.min(index, notes.length - 1)]
      focusWithoutScroll(note ? buttons.current.get(note.id) : emptyRef.current)
    },
  }))

  // La première ligne d'une note (sa date) a la hauteur du bouton quand il y en a un (supprimer ou
  // signaler) : le point de la ligne de temps se centre sur elle.
  const withButton = Boolean(onDelete ?? onReport)
  const firstLine = withButton ? layout.touchTarget : textStyles.caption.lineHeight

  if (notes.length === 0) {
    if (!empty) return null
    return (
      // tabIndex -1 (web) : on peut y poser le focus après la suppression de la dernière note.
      <View ref={emptyRef} {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}>
        <Text tone="secondary">{empty}</Text>
      </View>
    )
  }

  return (
    // role « list » : les lecteurs d'écran annoncent une liste et son nombre de notes.
    <View role="list">
      {notes.map((note, i) => {
        const last = i === notes.length - 1
        const bodyId = `${prefix}-${note.id}`
        return (
          <View key={note.id} role="listitem" style={{ flexDirection: 'row', gap: space.md }}>
            {/* La ligne de temps : le point, puis le trait jusqu'à la note suivante. */}
            <View style={{ width: DOT, alignItems: 'center' }} aria-hidden>
              <View
                style={{
                  marginTop: (firstLine - DOT) / 2,
                  width: DOT,
                  height: DOT,
                  borderRadius: radii.pill,
                  backgroundColor: colors.honey,
                }}
              />
              {last ? null : (
                <View
                  style={{
                    flex: 1,
                    width: borders.focus,
                    marginTop: space.xs,
                    backgroundColor: colors.honeySoft,
                  }}
                />
              )}
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 0,
                gap: space.xxs,
                // Sur un grand écran, la note garde une longueur de ligne confortable, et son bouton
                // « Supprimer » reste près d'elle au lieu de partir au bout de la colonne.
                maxWidth: readableWidth,
                paddingBottom: last ? 0 : space.xl,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  minHeight: firstLine,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption" weight={600} tone="muted">
                    {note.when}
                  </Text>
                </View>
                {onDelete ? (
                  <IconButton
                    ref={(node) => {
                      if (node) buttons.current.set(note.id, node)
                      else buttons.current.delete(note.id)
                    }}
                    icon="trash"
                    variant="plain"
                    label={deleteLabel ?? t('project.notes.delete')}
                    describedBy={bodyId}
                    // Array.from compte en caractères (un emoji entier), là où slice compterait en « unités ».
                    hint={shorten(note.body, 80)}
                    onPress={() => onDelete(note.id)}
                  />
                ) : onReport ? (
                  // Pour un autre membre : signaler la note. Même description que « Supprimer » :
                  // le lecteur d'écran dit laquelle.
                  <IconButton
                    icon="flag"
                    variant="plain"
                    label={reportLabel ?? t('report.note')}
                    describedBy={bodyId}
                    hint={shorten(note.body, 80)}
                    onPress={() => onReport(note.id)}
                  />
                ) : null}
              </View>
              {note.removed ? (
                <RemovalNotice title={note.removed.title} lines={note.removed.lines} compact />
              ) : null}
              {/* Texte brut, affiché tel quel ; selectable : on peut le copier. Un mot très long
                  (une adresse) se coupe au lieu de sortir de l'écran ; readable : sur un grand
                  écran, la ligne garde une longueur confortable. */}
              <Text nativeID={bodyId} selectable breakAnywhere readable>
                {note.body}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** Le début d'un texte, `max` caractères au plus (un emoji compte pour un), puis « … ». */
const shorten = (text: string, max: number) => {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}
