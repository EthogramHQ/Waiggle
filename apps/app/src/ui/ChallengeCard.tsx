// La carte d'un défi (R19, planches R19-Defis et R19-Recolte) : son libellé (« 5 retours entre
// vous »), une jauge en alvéoles (le rayon en petit, `HoneyComb size="small"`), son avancée
// (« 3 sur 5 ») et le miel qu'il rapporte. Elle sert au défi perso de « Mon défi », aux défis des
// ruches de « Ma récolte » (titrés du nom de la ruche) et à la carte « Défi de la semaine » de la
// page d'une ruche.
//
// Trois états :
// - `new` : le défi de ruche du lundi, sans avancée. « Nouveau », jamais « 0 sur 5 », ni à l'œil
//   ni au lecteur d'écran (option a14) ;
// - `active` : « 3 sur 5 », et le miel promis (« 10 miel ») ; jamais « +10 miel », qui dirait le
//   miel gagné avant l'heure ;
// - `done` : « Défi réussi », et ce qu'il a rapporté, « +10 miel » (option b2).
// La carte ne nomme jamais un membre : l'avancée est celle de tous (« sans dire qui n'a rien fait »).
import { space } from '@ruche/brand'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { Focusable } from './focus'
import { HoneyComb } from './HoneyComb'
import { Icon } from './Icon'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { type HeadingLevel, Text } from './Text'

type Props = {
  /** Le libellé du défi, déjà traduit (« 5 retours entre vous »). */
  label: string
  /** Les gestes comptés jusqu'ici. */
  progress: number
  /** Le but du défi (5 pour « 5 retours »). */
  target: number
  state: 'new' | 'active' | 'done'
  /** Le miel que le défi rapporte (10). */
  honey: number
  /**
   * Un titre au-dessus du libellé : « Défi de la semaine » sur la page d'une ruche (niveau 2), le
   * nom de la ruche dans « Défis de mes ruches » (niveau 3, sous le titre de la rubrique). Absent :
   * le libellé seul (« Mon défi », dont la rubrique porte déjà le titre).
   */
  title?: string
  /** Le niveau du titre dans la page (2 par défaut). */
  titleLevel?: HeadingLevel
  /**
   * Le libellé, pour y poser le focus : après « Choisir ce défi », l'écran amène le lecteur d'écran
   * sur la carte du défi choisi (`moveReaderTo`), plutôt que de le laisser sur un bouton disparu.
   */
  labelRef?: Ref<Focusable>
}

export function ChallengeCard({
  label,
  progress,
  target,
  state,
  honey,
  title,
  titleLevel = 2,
  labelRef,
}: Props) {
  const { t } = useTranslation()
  const progressText = t(($) => $.game.harvest.challenge.progress, { progress, target })
  const isNew = state === 'new'
  // Ce que la jauge dit au lecteur d'écran : l'avancée, « Nouveau » pour un défi neuf (jamais
  // « 0 sur 5 »), « Défi réussi » une fois réussi.
  const valueText = isNew
    ? t(($) => $.game.new)
    : state === 'done'
      ? t(($) => $.game.harvest.challenge.done)
      : progressText

  return (
    <Surface variant="grouped" padding="lg" gap="sm">
      {title ? (
        <Text variant="headline" heading={titleLevel}>
          {title}
        </Text>
      ) : null}
      {/* Le libellé et le miel, à sa droite (planche R19-Recolte, « Mon défi ») : la rangée passe
          à la ligne quand la place manque (320 points, texte à 200 %), le miel descend, rangé à
          droite. La jauge garde ainsi sa ligne à elle, avec l'avancée. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 }}>
          <Text
            weight={600}
            {...(title ? { tone: 'secondary' as const } : null)}
            {...(labelRef ? { focusRef: labelRef } : null)}
          >
            {label}
          </Text>
        </View>
        <View style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {state === 'done' ? (
            <StatusPill
              label={t(($) => $.game.harvest.challenge.reward, { amount: honey })}
              strong
            />
          ) : (
            <StatusPill label={t(($) => $.game.harvest.challenge.price, { amount: honey })} />
          )}
        </View>
      </View>
      {/* La jauge et l'avancée, qui passent à la ligne l'une sous l'autre si la place manque. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        <View style={{ flexShrink: 0 }}>
          <HoneyComb
            cells={isNew ? 0 : progress}
            count={target}
            label={label}
            valueText={valueText}
            tint="honey"
            pattern="smooth"
            size="small"
          />
        </View>
        {isNew ? (
          <StatusPill label={t(($) => $.game.new)} />
        ) : state === 'done' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <View style={{ flexShrink: 0 }}>
              <Icon name="check-circle" size={18} tone="success" />
            </View>
            <Text weight={600}>{t(($) => $.game.harvest.challenge.done)}</Text>
          </View>
        ) : (
          <Text weight={600} tabular>
            {progressText}
          </Text>
        )}
      </View>
    </Surface>
  )
}
