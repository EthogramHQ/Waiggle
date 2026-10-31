// La barre d'onglets du téléphone (tranche R3) : une barre de verre qui flotte en bas de l'écran,
// avec cinq places : Fil · Explorer · ( + ) · Ruches · Moi. Le « + » est un rond miel (jeton
// `layout.tabBar.publish`) qui ouvre la publication ; « Moi » montre la photo du membre (ses
// initiales sans photo), cerclée quand l'onglet est actif. L'onglet actif est posé sur une « goutte »
// claire (comme le choix actif d'un Segmented) qui glisse jusqu'au nouvel onglet en s'étirant, puis
// se pose ; avec « Réduire les animations », elle apparaît en fondu à sa nouvelle place.
//
// Pour les lecteurs d'écran : une région de navigation nommée, un lien par onglet avec sa vraie
// adresse (`href` : sur le web, un `<a>`, « ouvrir dans un nouvel onglet » marche), l'onglet actif
// dit par `aria-current="page"` (web) et `accessibilityState.selected` (téléphone, qui ignore
// `aria-current`). Le « + » est un bouton nommé (« Publier »). Chaque place fait au moins 44 points.
//
// Le composant ne décide de rien : les onglets, l'actif, la photo et la visibilité du « + » lui
// arrivent en props (navigation/AppTabBar.tsx les tire des pages et de la session), et il ne traduit
// rien (les libellés sont déjà traduits). Toucher un autre onglet appelle `onPress` ; toucher
// l'onglet déjà actif appelle `onReselect`, et c'est l'appelant qui décide : remonter l'écran en
// haut (le signal du contexte, tabBarSpace.ts) ou revenir à la première page de l'onglet. La barre
// ne lance pas elle-même la remontée : elle ne sait pas sur quelle page on est.
//
// TabBarHost, en bas du fichier, est le cadre qui pose la barre une fois pour toute l'appli
// (au-dessus de la pile des pages, dans app/_layout.tsx) et donne aux écrans la hauteur qu'elle
// occupe : celle que la barre mesure elle-même une fois rendue, 0 quand rien n'est rendu.
import { borders, durations, layout, radii, space, springs } from '@ruche/brand'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from './Avatar'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import type { PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Surface } from './Surface'
import { Text } from './Text'
import { TabBarSpaceContext, type TabKey } from './tabBarSpace'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

export type { TabKey }

export type TabBarTab = {
  key: TabKey
  /** Le libellé affiché et lu (« Fil », « Explorer »…), déjà traduit. */
  label: string
  href: string
}

export type TabBarProps = {
  tabs: readonly TabBarTab[]
  /** L'onglet actif ; `null` quand aucun ne l'est (la page d'un autre membre, sans onglet). */
  active: TabKey | null
  /**
   * La photo du membre pour l'onglet « Moi » : son nom (pour les initiales) et sa photo, toute
   * prête (adresse et en-tête de session, voir src/api/media.ts), ou `null` s'il n'en a pas.
   */
  avatar: { source: ImageSource | null; name: string }
  /** Le rond miel « + » : son adresse et son nom (« Publier ») ; `null` le cache (membre suspendu). */
  publish: { href: string; label: string } | null
  /** Un onglet touché, autre que l'actif, ou le « + » (`'publish'`). */
  onPress: (target: TabKey | 'publish') => void
  /** L'onglet déjà actif touché de nouveau : revenir à sa première page, ou remonter en haut. */
  onReselect: (tab: TabKey) => void
  /**
   * Force le mode « Réduire les animations » (la goutte apparaît en fondu). Sans cette prop, c'est
   * le réglage de l'appareil qui décide (useCalmMotion). Sert au catalogue et aux tests.
   */
  calm?: boolean
}

/** L'icône de chaque onglet ; « Moi » montre la photo à la place. */
const icons: Record<Exclude<TabKey, 'me'>, IconName> = {
  feed: 'house',
  explore: 'compass',
  hives: 'users',
}

/** La clé de la place du milieu, le « + », dans la rangée des cinq places. */
const PUBLISH_SLOT = 'publish'

// Un libellé agrandi par le réglage de l'appareil ne double pas : à 320 points de large, cinq places
// se partagent la largeur, et le libellé doit tenir sur une ligne sous l'icône (comme Wordmark).
// Sur téléphone, `maxScale` borne l'agrandissement ; le web l'ignore (voir TabLabel, plus bas).
const labelMaxScale = 1.2

/** La taille naturelle d'un libellé d'onglet, mesurée sur le web (voir TabLabel). */
type LabelSize = { width: number; height: number }

// Le cercle autour de la photo de « Moi » quand l'onglet est actif : son épaisseur et l'air entre
// lui et la photo (le même air, transparent, quand l'onglet est inactif : rien ne bouge).
const ringWidth = 2
const ringGap = 2
// La hauteur de la photo cerclée : les icônes des autres onglets prennent la même, pour que les
// quatre libellés soient sur la même ligne.
const pictureHeight = layout.tabBar.avatar + 2 * (ringGap + ringWidth)

// La goutte en mouvement s'étire de ce facteur avant de se poser (puis le ressort `drop` la ramène).
const stretchFactor = 1.25

/**
 * Deux tapes sur le même onglet à moins de ce délai ne valent qu'une : la page met un instant à
 * s'ouvrir, et la seconde tape d'une double tape ouvrait la même page deux fois (deux `push`).
 */
const DOUBLE_TAP_MS = 600

export function TabBar({
  tabs,
  active,
  avatar,
  publish,
  onPress,
  onReselect,
  calm: calmProp,
}: TabBarProps) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const deviceCalm = useCalmMotion()
  const calm = calmProp ?? deviceCalm

  // Les cinq places, dans l'ordre : deux onglets, le « + » (même caché, sa place reste : les
  // onglets ne se décalent pas quand il disparaît), deux onglets.
  const slots = useMemo<(TabBarTab | typeof PUBLISH_SLOT)[]>(() => {
    const list: (TabBarTab | typeof PUBLISH_SLOT)[] = [...tabs]
    list.splice(Math.ceil(tabs.length / 2), 0, PUBLISH_SLOT)
    return list
  }, [tabs])
  const activeIndex = slots.findIndex((slot) => slot !== PUBLISH_SLOT && slot.key === active)

  // La largeur de la rangée, mesurée à l'affichage : chaque place en prend une part égale. Avant la
  // mesure (et au pré-rendu web), la goutte reste invisible : elle n'a pas encore de place.
  const [rowWidth, setRowWidth] = useState(0)
  const slotWidth = rowWidth / slots.length

  // La goutte : sa position (translateX), son étirement (scaleX) et son opacité (le fondu du mode
  // réduit). Des « valeurs partagées » de Reanimated : elles s'animent hors du fil de React.
  const x = useSharedValue(0)
  const stretch = useSharedValue(1)
  const opacity = useSharedValue(0)
  // L'index où la goutte est posée, pour savoir si elle doit bouger ou seulement apparaître.
  const settledIndex = useRef<number | null>(null)
  useEffect(() => {
    if (slotWidth === 0 || activeIndex < 0) return
    const target = activeIndex * slotWidth
    if (settledIndex.current === null) {
      // Première mesure : la goutte se pose sans mouvement et apparaît.
      x.value = target
      opacity.value = withTiming(1, { duration: durations.quick })
    } else if (settledIndex.current === activeIndex) {
      // Seule la largeur a changé (rotation, fenêtre redimensionnée) : la goutte suit sans bruit.
      x.value = target
    } else if (calm) {
      // « Réduire les animations » : pas de glissement, un fondu à la nouvelle place.
      x.value = target
      opacity.value = 0
      opacity.value = withTiming(1, { duration: durations.base })
    } else {
      // Le miel : la goutte glisse avec le ressort `honey`, s'étire en partant et se pose avec le
      // ressort `drop` (la pastille qui tombe en place).
      x.value = withSpring(target, springs.honey)
      stretch.value = withSequence(
        withTiming(stretchFactor, { duration: durations.quick }),
        withSpring(1, springs.drop),
      )
    }
    settledIndex.current = activeIndex
  }, [activeIndex, slotWidth, calm, x, stretch, opacity])

  const dropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { scaleX: stretch.value }],
  }))

  // La garde contre la double tape : le dernier onglet touché et quand.
  const lastTap = useRef<{ key: TabKey; at: number } | null>(null)
  const press = (tab: TabBarTab) => (event?: PressEvent) => {
    // Sur le web, le `<a>` ne recharge pas la page : c'est le routeur qui change de page.
    if (Platform.OS === 'web') event?.preventDefault?.()
    const now = Date.now()
    const previous = lastTap.current
    lastTap.current = { key: tab.key, at: now }
    if (tab.key === active) {
      onReselect(tab.key)
      return
    }
    if (previous && previous.key === tab.key && now - previous.at < DOUBLE_TAP_MS) return
    onPress(tab.key)
  }
  const pressPublish = (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    onPress('publish')
  }

  const onRowLayout = (event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width)

  // Web : la taille naturelle de chaque libellé, et la réduction commune qui fait tenir le plus
  // large dans sa place (moins l'air de chaque côté). Voir TabLabel.
  const [labelSizes, setLabelSizes] = useState<Partial<Record<TabKey, LabelSize>>>({})
  const measureLabel = (key: TabKey) => (size: LabelSize) =>
    setLabelSizes((old) => {
      const known = old[key]
      // Le même objet quand rien ne change : pas de rendu de plus.
      return known && known.width === size.width && known.height === size.height
        ? old
        : { ...old, [key]: size }
    })
  const room = Math.max(slotWidth - 2 * space.xxs, 0)
  const widest = Math.max(0, ...Object.values(labelSizes).map((size) => size.width))
  const labelScale = room > 0 && widest > room ? room / widest : 1

  return (
    <Surface variant="glass" radius="pill" padding="xs">
      {/* Pas d'`accessible` sur la région : sur iOS, VoiceOver doit atteindre chaque lien. Le nom
          de la région est le seul texte que la barre lit elle-même. */}
      <View
        role="navigation"
        aria-label={t(($) => $.nav.label)}
        style={{ flexDirection: 'row', alignItems: 'stretch' }}
      >
        {/* La mesure de la largeur, sur une vue vide qui épouse la rangée, et non sur la rangée
            elle-même : le cadre (TabBarHost) écoute `onLayout` au-dessus de la barre, et une
            mesure posée sur la région l'intercepterait (le cadre ne saurait plus la hauteur). */}
        <View pointerEvents="none" onLayout={onRowLayout} style={StyleSheet.absoluteFill} />
        {/* La goutte, derrière les onglets : une place de large, toute la hauteur de la rangée.
            Intouchable et muette : l'état est dit par les liens eux-mêmes. */}
        {slotWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: slotWidth,
                borderRadius: radii.pill,
                backgroundColor: colors.surfaceRaised,
                boxShadow: shadows.soft,
              },
              dropStyle,
            ]}
          />
        ) : null}
        {slots.map((slot) => {
          if (slot === PUBLISH_SLOT) {
            return (
              <View
                key={PUBLISH_SLOT}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                {publish ? (
                  <PublishButton label={publish.label} href={publish.href} onPress={pressPublish} />
                ) : (
                  // La place reste, vide : les onglets ne bougent pas quand le « + » disparaît.
                  <View style={{ height: layout.tabBar.publish }} />
                )}
              </View>
            )
          }
          const isActive = slot.key === active
          return (
            <Pressable
              key={slot.key}
              accessibilityRole="link"
              accessibilityLabel={slot.label}
              // Les deux façons de dire « actif » : aria-current sur le web (linkProps), et
              // accessibilityState pour VoiceOver et TalkBack, qui ignorent aria-current.
              {...linkProps(slot.href, isActive)}
              accessibilityState={{ selected: isActive }}
              onPress={press(slot)}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xxs,
                // Au moins la hauteur du « + » : la rangée a partout la même hauteur, et chaque
                // place dépasse les 44 points à toucher.
                minHeight: Math.max(layout.tabBar.publish, layout.touchTarget),
                minWidth: layout.touchTarget,
                paddingVertical: space.xs,
                paddingHorizontal: space.xxs,
                borderRadius: radii.pill,
              }}
            >
              {slot.key === 'me' ? (
                <MeAvatar avatar={avatar} label={slot.label} active={isActive} />
              ) : (
                <View style={{ height: pictureHeight, justifyContent: 'center' }}>
                  <Icon
                    name={icons[slot.key]}
                    size={24}
                    // Inactive, l'icône prend l'encre, comme son libellé (voir TabLabel).
                    tone={isActive ? 'onHoney' : 'default'}
                  />
                </View>
              )}
              <TabLabel
                label={slot.label}
                active={isActive}
                scale={labelScale}
                size={labelSizes[slot.key]}
                onMeasure={measureLabel(slot.key)}
              />
            </Pressable>
          )
        })}
      </View>
    </Surface>
  )
}

/**
 * Le libellé d'un onglet, sur une ligne sous l'icône, même avec le texte agrandi.
 * - Sur téléphone, `maxScale` borne l'agrandissement (1,2) et `numberOfLines` coupe en dernier
 *   recours.
 * - Sur le web, ces réglages n'existent pas (`fontScale` y vaut toujours 1) : un navigateur réglé
 *   en grand texte grossit le libellé sans que l'appli le sache, et à 320 de large « Explorer »
 *   devenait « E… ». On mesure donc chaque libellé à sa largeur naturelle (`onMeasure`), et la barre
 *   réduit à l'œil (`transform: scale`) tous les libellés du même facteur, juste assez pour que le
 *   plus large tienne dans sa place, comme `adjustsFontSizeToFit` sur téléphone : les quatre
 *   gardent la même taille. Pour qu'un libellé garde sa largeur naturelle, il est posé dans une
 *   boîte de largeur nulle centrée (un mot ne se coupe pas : sa largeur minimale est la sienne),
 *   d'où il déborde également des deux côtés ; la mesure (`onLayout`) ignore la réduction.
 */
function TabLabel({
  label,
  active,
  scale,
  size,
  onMeasure,
}: {
  label: string
  active: boolean
  /** La réduction commune aux libellés (1 : aucune). Web seulement. */
  scale: number
  /** La taille naturelle de ce libellé, une fois mesurée. Web seulement. */
  size: LabelSize | undefined
  onMeasure: (size: LabelSize) => void
}) {
  const web = Platform.OS === 'web'
  const text = (
    <Text
      variant="caption"
      weight={active ? 700 : 500}
      // Sur la goutte, l'encre (onHoney, comme Segmented) ; ailleurs l'encre du verre (text) : le
      // gris secondaire tombait à 4,2:1 sur le verre de nuit posé sur une photo blanche.
      tone={active ? 'onHoney' : 'default'}
      align="center"
      {...(web
        ? {
            onLayout: (event: LayoutChangeEvent) => {
              const { width, height } = event.nativeEvent.layout
              onMeasure({ width, height })
            },
          }
        : { numberOfLines: 1 })}
      maxScale={labelMaxScale}
      selectable={false}
    >
      {label}
    </Text>
  )
  if (!web) return text
  return (
    <View
      style={{
        width: 0,
        // La hauteur réduite elle aussi : pas de bande vide sous le libellé réduit.
        ...(size && size.height > 0 ? { height: size.height * scale } : null),
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      {text}
    </View>
  )
}

/** La photo de « Moi » (ou ses initiales), cerclée d'encre quand l'onglet est actif. */
function MeAvatar({
  avatar,
  label,
  active,
}: {
  avatar: TabBarProps['avatar']
  label: string
  active: boolean
}) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        padding: ringGap,
        borderWidth: ringWidth,
        // Le cercle prend la couleur du contenu actif (l'encre sur la goutte) ; inactif, il est là
        // mais transparent : la photo ne change pas de place quand l'onglet devient actif.
        borderColor: active ? colors.onHoney : 'transparent',
        borderRadius: radii.pill,
      }}
    >
      <Avatar name={avatar.name} source={avatar.source} label={label} size={layout.tabBar.avatar} />
    </View>
  )
}

/** Le rond miel « + » du milieu : un bouton nommé (« Publier »), avec sa vraie adresse. */
function PublishButton({
  label,
  href,
  onPress,
}: {
  label: string
  href: string
  onPress: (event?: PressEvent) => void
}) {
  const { colors, shadows } = useTheme()
  const diameter = layout.tabBar.publish
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...linkProps(href, false)}
      onPress={onPress}
      style={({ pressed }) => ({
        width: diameter,
        height: diameter,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.honeyPressed : colors.honey,
        borderWidth: borders.hairline,
        borderColor: colors.glassBorder,
        boxShadow: `${shadows.highlight}, ${shadows.honey}`,
      })}
    >
      <Icon name="plus" size={28} tone="onHoney" />
    </Pressable>
  )
}

/**
 * Le cadre de la barre : il la pose en bas, par-dessus les pages (`position: absolute`), dégagée
 * de la zone du geste de l'appareil (`insets.bottom`), et donne aux écrans, par le contexte
 * (tabBarSpace.ts), la hauteur qu'elle occupe, avec le signal de remontée.
 * `bar` : la barre (un élément qui rend TabBar, ou rien), ou `null`.
 * La hauteur est celle de la barre **rendue**, mesurée sur la vue qui l'enveloppe au plus près (sans
 * marge), plus la marge du bas : l'élément reçu (AppTabBar) rend souvent `null` (visiteur, page
 * poussée, ordinateur) ; la vue mesure alors 0, et les écrans ne réservent rien de plus que leur
 * marge habituelle. Mesurer le cadre entier, c'était mesurer sa seule marge (8 points sur le web).
 * Dans l'ordre de lecture et du clavier, la barre vient avant les pages.
 */
export function TabBarHost({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { padding } = useLayout()
  // La hauteur de la barre rendue ; 0 tant qu'aucune barre n'est rendue.
  const [barHeight, setBarHeight] = useState(0)
  const [topSignal, setTopSignal] = useState(0)
  const scrollToTop = useCallback(() => setTopSignal((count) => count + 1), [])
  const shown = bar !== null && bar !== undefined
  // La marge sous la barre : la zone du geste de l'appareil, plus un peu d'air.
  const bottomGap = insets.bottom + space.sm
  // useMemo : la même valeur tant que rien ne change, sinon chaque écran se redessinerait à chaque
  // rendu du cadre.
  const value = useMemo(
    () => ({ height: shown && barHeight > 0 ? barHeight + bottomGap : 0, topSignal, scrollToTop }),
    [shown, barHeight, bottomGap, topSignal, scrollToTop],
  )
  return (
    <TabBarSpaceContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {shown ? (
          // pointerEvents box-none : la bande autour de la barre laisse passer les touchers vers la
          // page ; seule la barre les prend.
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
              paddingHorizontal: padding,
              paddingBottom: bottomGap,
              alignItems: 'center',
            }}
          >
            <View
              pointerEvents="box-none"
              onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
              style={{ width: '100%', maxWidth: layout.formWidth }}
            >
              {bar}
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </TabBarSpaceContext.Provider>
  )
}
