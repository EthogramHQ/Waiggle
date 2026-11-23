// Le panneau du niveau (R19, planches R19-Profil, R19-Membre et R19-Recolte) : l'alvéole du
// niveau, « Niveau 4 » et le titre, le miel à droite, le rayon, puis la phrase de pollen et la
// série de semaines butinées. Le même panneau sert à trois pages :
// - « Ma récolte » : le panneau seul, sans miel (la rubrique « Mon miel » le dit plus bas) et sans
//   lien (on y est déjà) ;
// - sa propre page (« Moi ») : tout, avec au-dessus le titre de la rubrique « Ma récolte › », un
//   lien vers la page de la récolte (`href`) ;
// - la page d'un proche (option a5 des planches) : son niveau, son titre et son rayon seulement,
//   jamais son miel, ni la phrase de pollen, ni ses semaines. L'écran ne passe simplement pas ces
//   données : le panneau n'affiche que ce qu'il reçoit.
//
// Le composant ne lit aucune donnée : l'écran lui passe tout, déjà calculé (le pollen avant le
// niveau suivant, les alvéoles remplies). L'alvéole du niveau elle-même (`LevelCell`, avec sa cire
// qui coule au passage de niveau) est un composant voisin : l'écran la pose dans `levelCell`, ce
// qui garde ici un seul rôle, la mise en page.
import { layout, space } from '@ruche/brand'
import type { DecorationPattern, DecorationTint } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { HoneyComb } from './HoneyComb'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import { useLinkPress } from './linkPress'
import { Mascot } from './Mascot'
import { linkProps } from './SettingsNav'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { headingLevel, Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le niveau atteint (« Niveau 4 »). */
  level: number
  /** Le titre du membre (« Gardienne »), déjà accordé à sa forme ; absent tant qu'il n'en a pas. */
  title?: string
  /** Son miel (« 35 miel ») : sur sa propre page seulement, jamais sur celle d'un proche. */
  honey?: number
  /** Les alvéoles remplies vers le niveau suivant, de 0 à 10 (option a1). */
  cells: number
  /** Le pollen qui manque avant le niveau suivant : sur sa propre page et « Ma récolte ». */
  toNext?: number
  /**
   * Les semaines butinées d'affilée, et si la série hiverne (une semaine sans geste : elle garde
   * son compte et dort, option a3). Absent sur la page d'un proche ; une série à zéro ne s'écrit
   * jamais.
   */
  weeks?: { count: number; hibernating: boolean }
  /** Le niveau vient de monter : la pastille « Nouveau », sans félicitation (option a10). */
  isNew: boolean
  /** La décoration du rayon, achetée avec du miel (« Décorer mon rayon »). */
  tint: DecorationTint
  pattern: DecorationPattern
  /**
   * L'adresse de « Ma récolte » : le titre de la rubrique « Ma récolte › » s'affiche au-dessus du
   * panneau, et c'est un lien (sa propre page). Absent : ni titre ni lien (« Ma récolte » même, la
   * page d'un proche).
   */
  href?: string
  /**
   * Un nouveau membre, sans aucune semaine butinée : la phrase qui dit d'où vient le pollen, à la
   * place de la série (option a11).
   */
  newcomerHint?: boolean
  /**
   * Le rayon d'un proche : lu « Son rayon » au lieu de « Mon rayon ». Rien d'autre ne change ici
   * (ce qu'on ne montre pas d'un proche, l'écran ne le passe pas).
   */
  theirs?: boolean
  /**
   * L'alvéole du niveau, à gauche de « Niveau 4 » (`<LevelCell level={4} size="regular" … />`,
   * avec `rise` au passage de niveau). Décorative ici : « Niveau 4 » est écrit juste à côté.
   */
  levelCell?: ReactNode
}

export function HarvestPanel({
  level,
  title,
  honey,
  cells,
  toNext,
  weeks,
  isNew,
  tint,
  pattern,
  href,
  newcomerHint = false,
  theirs = false,
  levelCell,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // La série ne s'écrit qu'avec au moins une semaine (« 0 semaine butinée » n'existe pas), et cède
  // sa place à la phrase du nouveau membre.
  const streak = !newcomerHint && weeks !== undefined && weeks.count > 0 ? weeks : null
  // La ligne du bas, sous un trait : la série, ou la phrase du nouveau membre.
  const footer = streak !== null || newcomerHint

  const panel = (
    <Surface variant="grouped" padding="lg" gap="md">
      {/* La tête : l'alvéole, le niveau et le titre, puis le miel et « Nouveau » à droite. La
          rangée passe à la ligne quand la place manque (320 points, texte à 200 %) : les pastilles
          descendent sous le niveau au lieu de l'écraser. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
        {levelCell ? (
          // L'alvéole ne rétrécit pas : sur le web, un dessin dans une rangée se laisserait écraser.
          <View style={{ flexShrink: 0 }}>{levelCell}</View>
        ) : null}
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 }}>
          <Text variant="headline">{t(($) => $.game.level, { level })}</Text>
          {title ? <Text tone="secondary">{title}</Text> : null}
        </View>
        {isNew || honey !== undefined ? (
          // Le côté droit, d'un bloc, rangé à droite même passé à la ligne.
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: space.xs,
              marginLeft: 'auto',
              maxWidth: '100%',
              flexShrink: 1,
            }}
          >
            {isNew ? <StatusPill label={t(($) => $.game.new)} strong /> : null}
            {honey !== undefined ? (
              <StatusPill label={t(($) => $.game.honey, { amount: honey })} />
            ) : null}
          </View>
        ) : null}
      </View>

      <HoneyComb
        cells={cells}
        label={theirs ? t(($) => $.game.comb.theirs) : t(($) => $.game.comb.mine)}
        valueText={t(($) => $.game.comb.cells, { count: cells, next: level + 1 })}
        tint={tint}
        pattern={pattern}
        size="regular"
      />

      {toNext !== undefined ? (
        <Text>{t(($) => $.game.toNext, { count: toNext, next: level + 1 })}</Text>
      ) : null}

      {footer ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingTop: space.md,
            borderTopWidth: 1,
            borderTopColor: colors.groupSeparator,
          }}
        >
          {/* L'abeille : en vol tant que la série vit, endormie quand elle hiverne (option a2). Un
              décor : la phrase à côté dit tout. */}
          <View style={{ flexShrink: 0 }}>
            {newcomerHint ? (
              <Icon name="sparkle-fill" size={20} tone="accent" />
            ) : (
              <Mascot pose={streak?.hibernating ? 'sleep' : 'fly'} size="inline" decorative />
            )}
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            {newcomerHint ? (
              <Text>{t(($) => $.game.newcomer)}</Text>
            ) : streak ? (
              <>
                <Text weight={600}>{t(($) => $.game.weeks, { count: streak.count })}</Text>
                {streak.hibernating ? (
                  // Une légende discrète, sans reproche (option a3).
                  <Text variant="caption" tone="muted">
                    {t(($) => $.game.hibernating)}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </Surface>
  )

  if (!href) return panel

  return (
    <View style={{ gap: space.sm }}>
      <SectionLink label={t(($) => $.game.harvest.title)} href={href} />
      {panel}
    </View>
  )
}

/**
 * Le titre de la rubrique, qui est aussi un lien : « Ma récolte › ». Un titre de section (niveau
 * 2), pour qu'un lecteur d'écran trouve la rubrique en parcourant la page par ses titres, et dedans
 * un vrai lien (`<a href>` sur le web : nouvel onglet, Entrée), nommé par son texte. La flèche est
 * un décor.
 */
function SectionLink({ label, href }: { label: string; href: string }) {
  // Le routeur change de page, une fois pour deux tapes ; le navigateur ne recharge pas (linkPress.ts).
  const open = useLinkPress()(href)
  return (
    <View {...headingLevel(2)}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        {...linkProps(href, false)}
        // Entrée ouvre la page sur le web, même quand le routeur intercepte le clic (keyboard.ts).
        {...enterActivates(open)}
        onPress={open}
        // 44 points de haut à toucher ; le lien ne s'étire pas sur toute la largeur.
        style={({ pressed }) => ({
          minHeight: layout.touchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          maxWidth: '100%',
          gap: space.xs,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="heading">{label}</Text>
        </View>
        <View style={{ flexShrink: 0 }}>
          <Icon name="caret-right" size={20} tone="default" />
        </View>
      </Pressable>
    </View>
  )
}
