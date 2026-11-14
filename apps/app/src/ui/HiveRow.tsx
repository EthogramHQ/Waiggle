// La ligne d'une ruche (tranche R10, planche R10-Ruches) : dans l'onglet Ruches, chaque ruche dont
// on est membre a la sienne. À gauche son alvéole (l'icône choisie à la création) ; au milieu son
// nom, « 4 membres · animée par Papi Jean » et la pile de quelques visages ; à droite ce qui est
// arrivé depuis la dernière visite de sa page : « 2 nouveautés » dans une pastille miel, ou
// « rien de neuf », en gris.
//
// Toute la ligne est un seul lien vers la page de la ruche. Un lecteur d'écran l'entend d'un bloc
// (« Famille, 4 membres, animée par Papi Jean, 2 nouveautés ») : ni l'alvéole ni les visages n'en
// font un arrêt de plus, ils sont cachés à l'oreille (le nom du lien dit déjà tout).
//
// En `compact` (« Tes ruches », la colonne du Fil sur ordinateur) : une petite alvéole de 28
// points, le nom et les nouveautés seulement. Le nom lu reste le même, entier : il ne coûte rien à
// l'œil et dit au lecteur d'écran ce que la ligne courte tait.
//
// Les cas particuliers viennent du contrat (`HiveSummary`) :
// - `name` null : la modération a retiré le nom, la ligne dit « Ruche sans nom » ;
// - `animator` null : plus d'animateur à montrer (compte supprimé, ou un blocage entre lui et le
//   lecteur) : « animée par » disparaît, à l'œil comme à l'oreille.
import { radii, space } from '@ruche/brand'
import type { HiveIcon, HiveSummary } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AvatarStack } from './AvatarStack'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { MetaLine } from './MetaLine'
import { Pressed } from './Pressed'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  hive: HiveSummary
  /** Ouvre la page de la ruche (l'écran choisit l'adresse). */
  onPress: () => void
  /** « Tes ruches » : l'alvéole de 28 points, le nom et les nouveautés seulement. */
  compact?: boolean
  /**
   * Fait d'une adresse de photo une source d'image : celle que rend `useMediaSources()`
   * (api/media.ts), donnée par l'écran (un composant ne parle jamais à l'API). Absente, ou null
   * pour une photo : les initiales du membre, dans la pile.
   */
  toSource?: (url: string | null | undefined) => ImageSource | null
}

/**
 * La largeur de base du texte de la ligne, en points : en dessous (téléphone étroit, texte agrandi
 * à 200 %), les nouveautés passent sous le texte au lieu de l'écraser contre l'alvéole.
 */
const TEXT_BASIS = { regular: 160, compact: 120 } as const

/** Cache une vue et ce qu'elle contient aux lecteurs d'écran : web, iOS et Android. */
const hiddenFromReaders = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

export function HiveRow({ hive, onPress, compact = false, toSource }: Props) {
  const { t } = useTranslation()
  const name = hive.name ?? t(($) => $.hives.unnamed)
  const members = t(($) => $.hives.members, { count: hive.memberCount })
  const news =
    hive.news === 0 ? t(($) => $.hives.newsNone) : t(($) => $.hives.news, { count: hive.news })
  const animator = hive.animator
  // Le nom du lien : la ligne entière, en une phrase, même en `compact`.
  const label = animator
    ? t(($) => $.hives.rowName, { hive: name, members, animator: animator.name, news })
    : t(($) => $.hives.rowNameNoAnimator, { hive: name, members, news })

  return (
    <Pressed label={label} onPress={onPress} role="link">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? space.sm : space.md,
          paddingVertical: compact ? space.xs : space.md,
          paddingHorizontal: compact ? space.sm : space.lg,
          // Le rayon de la ligne : l'anneau du focus du clavier le suit (Pressed le lit ici).
          borderRadius: radii.group,
        }}
      >
        <View {...hiddenFromReaders} style={{ flexShrink: 0 }}>
          <Badge icon={hive.icon} name={hive.name} size={compact ? 28 : 44} />
        </View>
        {/* Le texte et les nouveautés, dans une rangée qui passe à la ligne : quand la place manque,
            les nouveautés vont sous le texte (jamais `flex: 1`, qui vaut une base nulle sur le
            web ; minWidth 0 : un nom sans espace se coupe au lieu de déborder). */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.md,
            rowGap: space.xs,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
          }}
        >
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: compact ? TEXT_BASIS.compact : TEXT_BASIS.regular,
              maxWidth: '100%',
              gap: space.xxs,
            }}
          >
            {/* En entier, sur deux lignes s'il le faut : un nom ne se coupe jamais par « … ». */}
            <Text variant={compact ? 'callout' : 'headline'} weight={700} breakAnywhere>
              {name}
            </Text>
            {compact ? null : (
              <>
                <MetaLine>
                  <Text variant="caption" tone="secondary">
                    {members}
                  </Text>
                  {animator ? (
                    <Text variant="caption" tone="secondary" breakAnywhere>
                      {t(($) => $.hives.animatedBy, { name: animator.name })}
                    </Text>
                  ) : null}
                </MetaLine>
                {hive.faces.length > 0 ? (
                  <View style={{ marginTop: space.xs }}>
                    {/* Sans nom : un décor, caché tout entier (le nom du lien compte les membres). */}
                    <AvatarStack
                      members={hive.faces.map((face) => ({
                        name: face.name,
                        source: toSource ? toSource(face.avatarUrl) : null,
                      }))}
                      max={hive.faces.length}
                    />
                  </View>
                ) : null}
              </>
            )}
          </View>
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>
            {hive.news > 0 ? (
              // Le miel plein appelle l'œil vers ce qui est neuf ; ce n'est pas un bouton, la ligne
              // entière l'est déjà.
              <StatusPill label={news} strong />
            ) : (
              <Text variant="caption" tone="muted">
                {news}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressed>
  )
}

/**
 * Provisoire (R10) : la place de l'alvéole de la ruche, au format de `ui/HiveBadge` (même nom,
 * mêmes props), écrite en même temps ailleurs. À l'assemblage, cette fonction part et `HiveBadge`
 * la remplace. En attendant : un carré arrondi de miel doux et l'icône de la ruche.
 */
function Badge({ icon, size }: { icon: HiveIcon; name: string | null; size: 28 | 44 | 64 }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.small,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.honeySoft,
      }}
    >
      <Icon name={icon} size={size / 2} tone="amber" />
    </View>
  )
}
