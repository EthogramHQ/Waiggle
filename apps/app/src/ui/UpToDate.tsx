// « Tu es à jour » (R4, F-Fil5, planche R4-Fil-AJour) : le bloc de miel posé dans le fil de
// l'accueil, juste avant le premier élément déjà vu (ou à la fin d'un fil tout neuf). Il dit au
// membre qu'il peut s'arrêter : la sphère de miel et l'abeille endormie, le titre (sans phrase qui
// le redise : « Tu as tout vu » est retiré en RF, T1), puis
// « Explorer d'autres projets » en bouton secondaire (une possibilité, pas un appel : relecture
// juridique jur-J9) et l'indication que les nouveautés arriveront en haut du fil.
//
// Ce qu'il ne fait jamais (relecture de l'interface, ui-B6) : rien n'est annoncé (ni alerte, ni
// région vivante), et il ne prend pas le focus. On le rencontre en faisant défiler ; il ne coupe pas
// la lecture. Son titre est de niveau 2 : il partage le fil en deux listes, « avant » et « après ».
//
// Contraste : de jour, le texte est à l'encre (`onHoney`) posé sur la lumière miel, du blanc du cœur
// au miel du bord (couples `onHoney` sur `honeyLight` et sur `honey`, contrastPairs). La nuit, la
// lumière miel est une lanterne qui s'éteint dans le noir : aucun texte ne s'y lirait partout. Les
// textes y passent donc par le verre (`panel`, mesuré sur le miel et sur le noir), comme l'ancienne
// fin de fil.
import { honeyLight, radii, type Scheme, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Button } from './Button'
import { HoneySphere } from './HoneySphere'
import { Mascot } from './Mascot'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** « Explorer d'autres projets » : l'écran qui l'utilise mène à Explorer. */
  onExplore: () => void
  /**
   * Cache l'abeille endormie (la place qu'elle prend est gardée : rien ne bouge). Le Fil s'en sert
   * le temps de l'avis « Projet publié », qui porte sa propre mascotte et se posait sur celle-ci à
   * 390 points : une seule mascotte à la fois (R6a, relecture de design H1).
   */
  hideMascot?: boolean
}

/** Le diamètre de la sphère, en points. */
const SPHERE = 128

export function UpToDate({ onExplore, hideMascot = false }: Props) {
  const { t } = useTranslation()
  const { scheme } = useTheme()
  const night = scheme === 'night'
  // De jour, l'encre sur le miel ; la nuit, les couleurs ordinaires, sur le verre.
  const tone = night ? 'default' : 'onHoney'

  const texts = (
    <View style={{ alignSelf: 'stretch', alignItems: 'flex-start', gap: space.md }}>
      {/* Les textes prennent toute la largeur (sinon chacun aurait celle de son plus long mot) ;
          le bouton, lui, se range à gauche, à sa largeur. */}
      <View style={{ alignSelf: 'stretch', gap: space.xs }}>
        <Text variant="title3" heading={2} tone={tone}>
          {t(($) => $.feed.upToDate.title)}
        </Text>
      </View>
      <Button
        label={t(($) => $.feed.upToDate.action)}
        onPress={onExplore}
        variant="secondary"
        icon="compass"
      />
      <View style={{ alignSelf: 'stretch' }}>
        <Text variant="caption" tone={tone} readable>
          {t(($) => $.feed.upToDate.hint)}
        </Text>
      </View>
    </View>
  )

  return (
    <View
      style={{
        // Toute la largeur du fil, sur ordinateur aussi (ui-B6) : le bloc coupe le fil en deux.
        alignSelf: 'stretch',
        borderRadius: radii.ambiance,
        overflow: 'hidden',
        gap: space.xl,
        paddingVertical: space.xxxl,
        // 16 points de côté (pas 20) : la nuit, le verre ajoute les siens, et « Explorer d'autres
        // projets » passait sur deux lignes à 390 points.
        paddingHorizontal: space.lg,
      }}
    >
      <HoneyGlow scheme={scheme} />
      {/* La sphère et l'abeille endormie posée sur son épaule droite, rangées à gauche comme le
          texte (états rangés à gauche). L'abeille garde son nom, comme dans l'ancienne fin de
          fil (J10) : c'est le moment de marque du bout du fil. */}
      {/* La place autour de la sphère : l'abeille (96 points avec son disque) se pose en haut à
          droite et ne mord que sur le coin vide de la sphère, pas sur le miel. */}
      <View
        style={{
          alignSelf: 'flex-start',
          paddingTop: space.huge,
          paddingRight: space.huge + space.xl,
        }}
      >
        <HoneySphere size={SPHERE} />
        <View style={{ position: 'absolute', top: 0, right: 0 }}>
          {hideMascot ? null : <Mascot pose="sleep" size="sm" />}
        </View>
      </View>
      {night ? (
        <Surface variant="panel" radius="panel" padding="lg">
          {texts}
        </Surface>
      ) : (
        texts
      )}
    </View>
  )
}

/**
 * La lumière miel sous le bloc (`honeyLight`, @ruche/brand) : un dégradé rond dont le cœur clair
 * est derrière la sphère, en haut à gauche, et qui finit dans l'ambre (la nuit, dans le noir). Du
 * décor : caché aux lecteurs d'écran, immobile. L'identifiant dépend du thème seulement, pour que la
 * page préparée sur le serveur et le navigateur écrivent le même.
 */
function HoneyGlow({ scheme }: { scheme: Scheme }) {
  const id = `up-to-date-honey-${scheme}`
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {/* Les positions sont des parts du bloc : le dégradé s'étire avec lui, en ellipse. */}
          <RadialGradient id={id} cx={0.22} cy={0.22} r={1}>
            {honeyLight[scheme].map((stop) => (
              <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}
