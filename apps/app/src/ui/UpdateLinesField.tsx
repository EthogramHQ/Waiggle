// La liste « Ce qui a changé » de la feuille « Nouvelle mise à jour » (R7a, scénario « Publier une
// mise à jour », relecture du plan, interface A1) : de 1 à 5 lignes (`UpdateLineField`), chacune
// avec sa famille et son texte, dans une seule carte groupée, séparées par un trait ; la ligne où
// l'on écrit se teinte de miel doux. Au-dessus, le titre et un compteur « 2 / 5 » (lu « 2 lignes
// sur 5 ») ; dans la carte, « Ajouter une ligne » jusqu'à la cinquième ; dessous, une aide.
//
// Les lignes appartiennent à l'écran (la feuille, par `updates/form.ts`) : il les fabrique, chacune
// avec un `id` stable, et ce composant ne fait que les montrer et dire ce qu'on y change. Chaque
// ligne est rangée sous son `id`, jamais sous son rang : retirer la deuxième ligne ne fait pas
// glisser le texte ni la famille de la troisième dans la place de la deuxième (React garde à chaque
// clé son champ, son curseur et son focus).
//
// Le focus ne se perd jamais : après « Ajouter une ligne », il va au champ ajouté ; au retrait, à
// la ligne d'avant (ou à la suivante, si l'on retire la première) ; et chaque refus de publier
// (`error`) le pose sur la première ligne, marquée invalide.
import { layout, space } from '@ruche/brand'
import type { UpdateFamily } from '@ruche/contracts'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, type TextInput, View } from 'react-native'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import { Text } from './Text'
import { FieldGroup } from './TextField'
import { UpdateLineField } from './UpdateLineField'

/** Une ligne de la liste, telle que l'écran la tient : son `id` ne change jamais. */
export type UpdateLineValue = { id: string; family: UpdateFamily; text: string }

/** Le nombre de lignes, au plus (le contrat de l'API dit la même chose). */
export const UPDATE_LINES_MAX = 5

type Props = {
  lines: UpdateLineValue[]
  onAdd: () => void
  onRemove: (id: string) => void
  onFamilyChange: (id: string, family: UpdateFamily) => void
  onTextChange: (id: string, text: string) => void
  /** Le refus de publier, posé sur la première ligne ; chaque nouvelle valeur lui rend le focus. */
  error?: string | null | undefined
  /**
   * La ligne qui porte l'erreur (une ligne trop longue) ; absente : la première (« écris au moins
   * un changement »).
   */
  errorLineId?: string | null | undefined
  /** Faux pendant l'envoi : rien ne change dans la liste. */
  editable?: boolean
}

/**
 * Donne le focus à un champ. Sur le web, sans faire défiler la page (la feuille montre déjà la
 * ligne) ; sur téléphone, le champ prend le focus du clavier comme après un toucher.
 */
const focusField = (field: TextInput | undefined) => {
  if (!field) return
  if (!focusWithoutScroll(field)) field.focus()
}

export function UpdateLinesField({
  lines,
  onAdd,
  onRemove,
  onFamilyChange,
  onTextChange,
  error = null,
  errorLineId = null,
  editable = true,
}: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  // Les saisies des lignes, rangées par `id` : on y pose le focus après un ajout ou un retrait.
  const fields = useRef(new Map<string, TextInput>())
  // Une poignée par ligne, gardée d'un rendu à l'autre (une nouvelle fonction à chaque rendu ferait
  // défaire puis refaire la poignée à chaque lettre tapée).
  const handles = useRef(new Map<string, (node: TextInput | null) => void>())
  const handleOf = (id: string) => {
    const known = handles.current.get(id)
    if (known) return known
    const handle = (node: TextInput | null) => {
      if (node) fields.current.set(id, node)
      else fields.current.delete(id)
    }
    handles.current.set(id, handle)
    return handle
  }

  // Où ira le focus quand la liste aura changé : la ligne ajoutée (`added`, l'écran fabrique son
  // `id`), ou la voisine d'une ligne retirée. Décidé au geste, appliqué après le rendu.
  const pending = useRef<{ kind: 'added' } | { kind: 'line'; id: string } | null>(null)
  // Les `id` du rendu d'avant : la ligne ajoutée est celle qui n'y était pas.
  const known = useRef(lines.map((line) => line.id))

  // useLayoutEffect : après que la liste a été dessinée (le nouveau champ existe), avant que le
  // navigateur ne repeigne : le focus arrive en même temps que la ligne.
  useLayoutEffect(() => {
    const before = known.current
    known.current = lines.map((line) => line.id)
    const wanted = pending.current
    if (!wanted) return
    if (wanted.kind === 'added') {
      const added = lines.find((line) => !before.includes(line.id))
      if (!added) return
      pending.current = null
      focusField(fields.current.get(added.id))
      return
    }
    if (lines.some((line) => line.id === wanted.id)) {
      // La ligne retirée n'est plus là : le focus va à sa voisine, gardée.
      if (lines.length < before.length) {
        pending.current = null
        focusField(fields.current.get(wanted.id))
      }
    } else pending.current = null
  }, [lines])

  // Chaque refus de publier pose le focus sur la ligne en erreur : la fautive si on la nomme (et
  // qu'elle existe encore), sinon la première. Pas au premier dessin : le focus ne bouge qu'après
  // un geste (« Publier »).
  const firstId = lines[0]?.id
  const errorId =
    errorLineId !== null && lines.some((line) => line.id === errorLineId) ? errorLineId : firstId
  const shown = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule une nouvelle erreur déplace le focus.
  useEffect(() => {
    if (!shown.current) {
      shown.current = true
      return
    }
    if (error && errorId) focusField(fields.current.get(errorId))
  }, [error])

  const remove = (id: string) => {
    const at = lines.findIndex((line) => line.id === id)
    if (at < 0) return
    const neighbour = lines[at - 1] ?? lines[at + 1]
    pending.current = neighbour ? { kind: 'line', id: neighbour.id } : null
    onRemove(id)
  }

  const add = () => {
    if (lines.length >= UPDATE_LINES_MAX) return
    pending.current = { kind: 'added' }
    onAdd()
  }

  const total = lines.length
  const canAdd = total < UPDATE_LINES_MAX

  return (
    // Un groupe nommé par son titre (web) : le lecteur d'écran dit « Ce qui a changé, groupe » en
    // y entrant. Pas d'`accessible` : sur iOS, VoiceOver doit atteindre chaque ligne.
    <View
      {...(Platform.OS === 'web' ? { role: 'group' as const, 'aria-labelledby': titleId } : null)}
      style={{ gap: space.sm, alignSelf: 'stretch' }}
    >
      {/* Le titre et le compteur, sur une rangée qui passe à la ligne à texte très agrandi. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          columnGap: space.md,
          paddingHorizontal: space.xs,
        }}
      >
        <View style={{ flexShrink: 1, maxWidth: '100%' }}>
          <Text nativeID={titleId} variant="caption" weight={600} tone="secondary">
            {t(($) => $.project.updates.changes)}
          </Text>
        </View>
        {/* « 2 / 5 » à l'œil ; « 2 lignes sur 5 » au lecteur d'écran (une barre oblique se lirait
            « barre oblique »). */}
        <Text
          variant="caption"
          tone="muted"
          tabular
          accessibilityLabel={t(($) => $.project.updates.counterLabel, {
            count: total,
            max: UPDATE_LINES_MAX,
          })}
        >
          {t(($) => $.project.updates.counter, { count: total, max: UPDATE_LINES_MAX })}
        </Text>
      </View>
      <FieldGroup>
        {lines.map((line, index) => (
          <UpdateLineField
            key={line.id}
            family={line.family}
            text={line.text}
            onFamilyChange={(family) => onFamilyChange(line.id, family)}
            onTextChange={(text) => onTextChange(line.id, text)}
            onRemove={total > 1 ? () => remove(line.id) : undefined}
            placeholder={t(($) => $.update.example[line.family])}
            error={line.id === errorId && error ? error : undefined}
            inputRef={handleOf(line.id)}
            index={index}
            total={total}
            editable={editable}
          />
        ))}
        {canAdd ? <AddLine key="add" onPress={add} disabled={!editable} /> : null}
      </FieldGroup>
      <View style={{ paddingHorizontal: space.xs }}>
        <Text variant="caption" tone="muted">
          {t(($) => $.project.updates.linesHint)}
        </Text>
      </View>
    </View>
  )
}

/**
 * « Ajouter une ligne » : la dernière rangée de la carte, un « + » et son texte en couleur d'accent
 * (l'action miel de la feuille reste « Publier »). Toute la rangée se touche, 44 points de haut.
 */
function AddLine({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const { t } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      aria-disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: layout.touchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        // Le « + » au droit des pastilles, le texte au droit de celui des lignes (UpdateLineField).
        gap: space.lg,
        paddingLeft: space.xs,
        paddingRight: space.lg,
        paddingVertical: space.sm,
        opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
      })}
    >
      {/* Le « + » dans la même colonne que les pastilles des lignes (44 points de large). */}
      <View style={{ width: layout.touchTarget, alignItems: 'center', flexShrink: 0 }}>
        <Icon name="plus" size={20} tone="amber" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text weight={600} tone="accent" selectable={false}>
          {t(($) => $.project.updates.addLine)}
        </Text>
      </View>
    </Pressable>
  )
}
