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
// l'onglet déjà actif appelle `onReselect` et prévient les écrans par le contexte (tabBarSpace.ts),
// pour que l'écran affiché remonte en haut.
//
// TabBarHost, en bas du fichier, est le cadre qui pose la barre une fois pour toute l'appli
// (au-dessus de la pile des pages, dans app/_layout.tsx), mesure sa hauteur et la donne aux écrans.
import { borders, durations, layout, radii, space, springs } from '@ruche/brand'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type LayoutChangeEvent, Platform, Pressable, View } from 'react-native'
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
import { TabBarSpaceContext, useTabBarSpace } from './tabBarSpace'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Les quatre onglets, dans l'ordre de la barre (le « + » se glisse au milieu). */
export type TabKey = 'feed' | 'explore' | 'hives' | 'me'

export type TabBarTab = {
  key: TabKey
  /** Le libellé affiché et lu (« Fil », « Explorer »…), déjà traduit. */
  label: string
  href: string
}

export type TabBarProps = {
  /** Le nom de la région de navigation, lu par les lecteurs d'écran (« Navigation principale »). */
  label: string
  tabs: readonly TabBarTab[]
  /** L'onglet actif. */
  active: TabKey
  /**
   * La photo du membre pour l'onglet « Moi » : son nom (pour les initiales) et, s'il en a une, sa
   * photo : `source` toute prête (adresse et en-tête de session, voir src/api/media.ts) ou, à
   * défaut, sa seule adresse `url`.
   */
  avatar: { name: string; url?: string | null; source?: ImageSource | null }
  /** Le rond miel « + » : son adresse et son nom (« Publier ») ; `null` le cache (membre suspendu). */
  publish: { href: string; label: string } | null
  /** Un onglet touché, autre que l'actif. */
  onPress: (tab: TabKey) => void
  /** L'onglet déjà actif touché de nouveau : revenir à sa première page, ou remonter en haut. */
  onReselect: (tab: TabKey) => void
  /** Le « + » touché. */
  onPublish?: () => void
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
const labelMaxScale = 1.2

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
  label,
  tabs,
  active,
  avatar,
  publish,
  onPress,
  onReselect,
  onPublish,
  calm: calmProp,
}: TabBarProps) {
  const { colors, shadows } = useTheme()
  const deviceCalm = useCalmMotion()
  const calm = calmProp ?? deviceCalm
  const { requestReselect } = useTabBarSpace()

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
      requestReselect()
      return
    }
    if (previous && previous.key === tab.key && now - previous.at < DOUBLE_TAP_MS) return
    onPress(tab.key)
  }
  const pressPublish = (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    onPublish?.()
  }

  const onRowLayout = (event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width)

  return (
    <Surface variant="glass" radius="pill" padding="xs">
      {/* Pas d'`accessible` sur la région : sur iOS, VoiceOver doit atteindre chaque lien. */}
      <View
        role="navigation"
        aria-label={label}
        onLayout={onRowLayout}
        style={{ flexDirection: 'row', alignItems: 'stretch' }}
      >
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
                    tone={isActive ? 'onHoney' : 'secondary'}
                  />
                </View>
              )}
              {/* Sur la goutte, l'encre (ton onHoney, lisible jour et nuit, comme Segmented) ;
                  ailleurs, le ton secondaire sur le verre. Une ligne : à 320 points, un libellé
                  agrandi qui ne tient pas est coupé plutôt que de chevaucher son voisin. */}
              <Text
                variant="caption"
                weight={isActive ? 700 : 500}
                tone={isActive ? 'onHoney' : 'secondary'}
                align="center"
                numberOfLines={1}
                maxScale={labelMaxScale}
                selectable={false}
              >
                {slot.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Surface>
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
  const source = avatar.source ?? (avatar.url ? { uri: avatar.url } : null)
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
      <Avatar name={avatar.name} source={source} label={label} size={layout.tabBar.avatar} />
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
 * de la zone du geste de l'appareil (`insets.bottom`), mesure la hauteur qu'elle occupe et la donne
 * aux écrans par le contexte (tabBarSpace.ts), avec le signal de remontée.
 * `bar` : la barre toute prête (un élément TabBar), ou `null` quand elle ne doit pas s'afficher
 * (visiteur, page poussée par-dessus) : les écrans ne réservent alors rien.
 * Dans l'ordre de lecture et du clavier, la barre vient avant les pages.
 */
export function TabBarHost({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { padding } = useLayout()
  const [measured, setMeasured] = useState(0)
  const [reselect, setReselect] = useState(0)
  const requestReselect = useCallback(() => setReselect((count) => count + 1), [])
  const shown = bar !== null && bar !== undefined
  // useMemo : la même valeur tant que rien ne change, sinon chaque écran se redessinerait à chaque
  // rendu du cadre.
  const value = useMemo(
    () => ({ height: shown ? measured : 0, reselect, requestReselect }),
    [shown, measured, reselect, requestReselect],
  )
  return (
    <TabBarSpaceContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {shown ? (
          // pointerEvents box-none : la bande autour de la barre laisse passer les touchers vers la
          // page ; seule la barre les prend.
          <View
            pointerEvents="box-none"
            onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
              paddingHorizontal: padding,
              paddingBottom: insets.bottom + space.sm,
              alignItems: 'center',
            }}
          >
            <View pointerEvents="box-none" style={{ width: '100%', maxWidth: layout.formWidth }}>
              {bar}
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </TabBarSpaceContext.Provider>
  )
}
