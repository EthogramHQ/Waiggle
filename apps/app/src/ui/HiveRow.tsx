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
//
// R16 (« Les squelettes ») : `HiveRowSkeleton`, la ligne vide, à la hauteur d'une vraie ligne
// (« Tes ruches » de la colonne du Fil la pose pendant la lecture des ruches : une ligne de liste
// ordinaire, de 72 points, valait presque deux lignes courtes de 44, et la colonne sautait).
import { layout, radii, space } from '@ruche/brand'
import type { HiveSummary } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View, type ViewStyle } from 'react-native'
import { AvatarStack } from './AvatarStack'
import { Hexagon, HiveBadge } from './HiveBadge'
import type { ImageSource } from './image'
import { TextLineShape } from './ListGroup'
import { Pressed } from './Pressed'
import { Shape } from './Skeleton'
import { STATUS_PILL_HEIGHT, StatusPill } from './StatusPill'
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
const TEXT_BASIS = { regular: 120, compact: 100 } as const

/**
 * Le cadre de la ligne : ses marges et l'écart entre l'alvéole et le texte. Partagé avec sa pièce
 * vide (`HiveRowSkeleton`) : la ligne vide a ainsi la hauteur de la vraie, et rien ne saute quand
 * elle arrive.
 */
const rowFrame = (compact: boolean): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: compact ? space.sm : space.md,
  paddingVertical: compact ? space.xs : space.md,
  paddingHorizontal: compact ? space.sm : space.lg,
  // Le rayon de la ligne : l'anneau du focus du clavier le suit (Pressed le lit ici).
  borderRadius: radii.group,
})

/** La taille de l'alvéole : 28 points dans la forme courte, 44 sinon (`layout.hive`). */
const badgeSize = (compact: boolean) => (compact ? layout.hive.small : layout.hive.regular)

/** Cache une vue et ce qu'elle contient aux lecteurs d'écran : web, iOS et Android. */
const hiddenFromReaders = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

/**
 * Hook : les textes d'une ruche, partagés par sa ligne (`HiveRow`) et sa carte (`HiveCard`, R16) :
 * son nom (« Ruche sans nom » s'il a été retiré), « 4 membres · animée par Papi Jean », ses
 * nouveautés, et le nom lu du lien, la phrase entière. Écrits une seule fois : la ligne et la
 * carte se lisent pareil.
 */
export function useHiveText(hive: HiveSummary) {
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
  // Un seul texte, qui passe à la ligne comme une phrase (« 4 membres · animée par / Papi Jean »,
  // la planche) : en morceaux séparés, le point commençait la ligne.
  const detail = animator
    ? `${members} · ${t(($) => $.hives.animatedBy, { name: animator.name })}`
    : members
  return { name, news, label, detail }
}

export function HiveRow({ hive, onPress, compact = false, toSource }: Props) {
  const { name, news, label, detail } = useHiveText(hive)

  return (
    // `inset` : rangée dans un `ListGroup` qui rogne, la ligne dessine son anneau de focus à
    // l'intérieur (relecture du design de R10 : la dernière ligne n'en montrait que le haut).
    <Pressed label={label} onPress={onPress} role="link" inset>
      <View style={rowFrame(compact)}>
        <View {...hiddenFromReaders} style={{ flexShrink: 0 }}>
          <HiveBadge icon={hive.icon} name={hive.name} size={badgeSize(compact)} />
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
                <Text variant="caption" tone="secondary" breakAnywhere>
                  {detail}
                </Text>
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

/** Les largeurs des pièces vides : le nom, la précision, les visages et la pastille des nouveautés. */
const EMPTY = {
  name: '55%',
  detail: '80%',
  faces: 72,
  // La hauteur de la pile des visages (`AvatarStack`, taille regular).
  facesHeight: 28,
  news: 88,
  newsCompact: 56,
} as const

/**
 * La ligne vide d'une ruche (R16, plan, choix 4) : l'alvéole vide, le nom et, hors de la forme
 * courte, « 4 membres · animée par… » et la pile des visages ; à droite, la pastille des
 * nouveautés. Mêmes marges que la vraie ligne (`rowFrame`), et la même hauteur minimale (celle de
 * la zone à toucher de `Pressed`) : la ligne qui arrive prend exactement sa place.
 *
 * Sans rôle ni nom : le `Loading` qui l'entoure (ui/Skeleton.tsx) dit « Chargement… », une seule
 * fois pour toutes les lignes. À poser dans un `ListGroup`, comme les vraies lignes.
 */
export function HiveRowSkeleton({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme()
  return (
    <View style={{ minHeight: layout.touchTarget, justifyContent: 'center' }}>
      <View style={rowFrame(compact)}>
        <View style={{ flexShrink: 0 }}>
          <Hexagon size={badgeSize(compact)} fill={colors.skeleton} />
        </View>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }}>
          <TextLineShape variant={compact ? 'callout' : 'headline'} width={EMPTY.name} />
          {compact ? null : (
            <>
              <TextLineShape variant="caption" width={EMPTY.detail} />
              <View style={{ marginTop: space.xs }}>
                <Shape height={EMPTY.facesHeight} width={EMPTY.faces} round />
              </View>
            </>
          )}
        </View>
        <Shape height={STATUS_PILL_HEIGHT} width={compact ? EMPTY.newsCompact : EMPTY.news} round />
      </View>
    </View>
  )
}
