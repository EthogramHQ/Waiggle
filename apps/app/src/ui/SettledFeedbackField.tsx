// La partie « Retours réglés » de la feuille « Nouvelle mise à jour » (R7b, décision 4 du plan ;
// planche validée 12, `R7b-MAJ-Regles` ; relecture juridique du plan J9). L'auteur coche les retours
// de ses testeurs que cette mise à jour règle : à la publication, ils passent dans « Réglés », et
// les testeurs actuels lisent « Réglé dans la v1.3 » sous leur retour.
// - En haut, le titre et le compteur (« 2 sur 3 » à l'œil, « 2 retours cochés sur 3 » au lecteur
//   d'écran), comme « Ce qui a changé » plus haut dans la même feuille (`UpdateLinesField`).
// - Puis l'aide, qui dit qui lira quoi (J9 : un ancien testeur ne lit plus rien).
// - Puis une case par retour à traiter (`Checkbox` et son `detail`), dans un groupe à traits fins :
//   nommée par le testeur et l'issue (« Inès Morel · En partie »), décrite par l'extrait et la date
//   écrits par l'écran, et « Ne teste plus » sous le détail d'un ancien testeur.
// - Au plus `max` retours par mise à jour : à la limite, les cases restantes deviennent inactives et
//   une phrase le dit, annoncée au lecteur d'écran (`LiveStatus`). Les cases cochées restent
//   actives : on peut toujours décocher pour en choisir une autre.
// - `editable={false}` (la feuille publie) : toutes les cases sont inactives, rien ne change.
//
// Le composant ne garde rien : la liste cochée (`value`) appartient à l'écran, qui la reçoit par
// `onChange` à chaque case touchée.
import { space } from '@ruche/brand'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import { Checkbox } from './Checkbox'
import { Hint } from './Hint'
import { LiveStatus } from './LiveStatus'
import { Text } from './Text'
import { FieldGroup } from './TextField'

/** Un retour à traiter, tel que l'écran le prépare. */
export type SettledFeedbackItem = {
  /** L'identifiant du retour (un message de type `feedback`). */
  id: string
  /** Le nom de la case : `settledField.item` (« Inès Morel · En partie »). */
  label: string
  /** L'extrait et la date, déjà écrits (`settledField.detail` ou `detailNoText`) ; null : rien. */
  detail: string | null
  /** Vrai si la personne ne teste plus le projet : « Ne teste plus » s'ajoute au détail. */
  former: boolean
}

type Props = {
  items: SettledFeedbackItem[]
  /** Les identifiants des retours cochés. */
  value: string[]
  /** La nouvelle liste cochée, après une case touchée. */
  onChange: (ids: string[]) => void
  /** Le plus de retours qu'une mise à jour peut régler (`@ruche/contracts`). */
  max: number
  /** Faux pendant la publication : aucune case ne se touche. Vrai par défaut. */
  editable?: boolean
}

export function SettledFeedbackField({ items, value, onChange, max, editable = true }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const count = value.length
  const total = items.length
  const full = count >= max
  const former = t(($) => $.project.testers.settledField.former)

  /** Coche ou décoche un retour, en gardant l'ordre des autres. */
  const toggle = (id: string, checked: boolean) => {
    if (!editable) return
    if (checked) {
      // Une case inactive ne se touche pas ; la garde reste ici, au cas où (double tape rapide).
      if (value.includes(id) || full) return
      onChange([...value, id])
    } else onChange(value.filter((known) => known !== id))
  }

  return (
    // Un groupe nommé par son titre (web) : le lecteur d'écran dit « Retours réglés, groupe » en y
    // entrant. Pas d'`accessible` : sur iOS, VoiceOver doit atteindre chaque case.
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
            {t(($) => $.project.testers.settledField.title)}
          </Text>
        </View>
        {/* « 2 sur 3 » à l'œil ; « 2 retours cochés sur 3 » au lecteur d'écran. */}
        <Text
          variant="caption"
          tone="muted"
          tabular
          accessibilityLabel={t(($) => $.project.testers.settledField.countSpoken, {
            count,
            total,
          })}
        >
          {t(($) => $.project.testers.settledField.count, { count, total })}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space.xs }}>
        <Hint icon="info" text={t(($) => $.project.testers.settledField.hint)} />
      </View>
      <FieldGroup>
        {items.map((item) => {
          const checked = value.includes(item.id)
          // L'ancien testeur : « Ne teste plus » sur sa propre ligne, sous l'extrait et la date.
          const detail = [item.detail, item.former ? former : null].filter(Boolean).join('\n')
          return (
            <View key={item.id} style={{ paddingHorizontal: space.lg }}>
              <Checkbox
                label={item.label}
                value={checked}
                onValueChange={(next) => toggle(item.id, next)}
                // À la limite, seules les cases cochées restent actives (pour décocher).
                disabled={!editable || (full && !checked)}
                {...(detail ? { detail } : null)}
              />
            </View>
          )
        })}
      </FieldGroup>
      {/* Toujours montée, vide sous la limite : la phrase est annoncée quand on l'atteint. */}
      <View style={{ paddingHorizontal: space.xs }}>
        <LiveStatus
          message={full ? t(($) => $.project.testers.settledField.max, { max }) : ''}
          small
        />
      </View>
    </View>
  )
}
