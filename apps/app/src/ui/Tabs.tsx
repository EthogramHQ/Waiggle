// Des onglets (tranche R2) : deux ou trois vues qui se partagent un même panneau, une seule
// visible à la fois (« Se connecter » / « Créer un compte » sur ordinateur). La rangée des onglets
// est une capsule posée sur le verre, l'onglet choisi en relief (la « goutte » blanche, comme le
// choix actif d'un Segmented) ; le contenu de l'onglet choisi s'affiche dessous.
//
// Pour les lecteurs d'écran, c'est le modèle « onglets » de WAI-ARIA : une liste d'onglets
// (`tablist`, nommée), un `tab` par onglet (qui dit s'il est choisi, `aria-selected`, et quel
// panneau il commande, `aria-controls`), et un seul panneau (`tabpanel`), celui de l'onglet choisi,
// nommé par son onglet (`aria-labelledby`).
// Au clavier (web) : Tab ne s'arrête qu'une fois dans la rangée, sur l'onglet choisi (« tabIndex
// itinérant », comme Segmented) ; les flèches gauche et droite passent à l'onglet voisin en le
// choisissant (en faisant le tour), Début et Fin vont au premier et au dernier. Choisir un onglet
// au clavier le montre aussitôt : il n'y a rien à valider.
//
// Deux options de la tranche R10 (le sélecteur de ruches du Fil, ui/HivePills.tsx) :
// - `panelId` : le panneau est porté ailleurs (le Fil, dessiné par l'écran). Les onglets ne
//   dessinent alors aucun panneau, et chacun dit commander celui-là ;
// - `scroll` : les onglets restent sur une seule ligne, qui défile de côté quand elle est plus
//   large que la place (huit ruches sur un téléphone), et la bande amène toujours l'onglet choisi
//   entièrement en vue (`scrollToShow`, celui de Segmented et de FilterPills).
import { layout, radii, space } from '@ruche/brand'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { focusWithoutScroll } from './focus'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { scrollToShow } from './Segmented'
import { Surface, type SurfaceVariant } from './Surface'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Un onglet : sa clé (stable, sert d'identifiant), son libellé et ce qu'il montre. */
export type Tab<K extends string> = {
  key: K
  label: string
  /** Ce que l'onglet montre ; rien quand le panneau est porté ailleurs (`panelId`). */
  content?: ReactNode
  /**
   * Une icône avant le libellé (R7b : « Appels » et son mégaphone, « Retours » et sa bulle).
   * Décorative : cachée des lecteurs d'écran, l'onglet reste nommé par son seul libellé.
   */
  icon?: IconName
  /**
   * R10 : le nom lu, quand il diffère du libellé affiché. « Projets · 5 » se voit, « Projets, 5
   * projets » s'entend : le point médian et le nombre seul ne se lisent pas bien. Il garde les mots
   * affichés, dans le même ordre (WCAG 2.5.3 : on peut dire « Projets » pour le toucher). Sans lui,
   * le libellé.
   */
  spokenLabel?: string
}

/** La taille de l'icône d'un onglet, à l'échelle du texte « callout » qu'elle précède. */
const ICON_SIZE = 18

type Props<K extends string> = {
  /** Le nom de la rangée d'onglets, lu par les lecteurs d'écran (« Connexion ou inscription »). */
  label: string
  tabs: readonly Tab<K>[]
  /** La clé de l'onglet choisi. */
  selected: K
  onSelect: (key: K) => void
  /**
   * La matière de la capsule : glass (par défaut) sur le miel ou une lumière, grouped sur une
   * surface pleine.
   */
  variant?: Extract<SurfaceVariant, 'glass' | 'grouped'>
  /**
   * Donne le focus à l'onglet choisi dès l'affichage (web) : quand changer d'onglet a aussi changé
   * de page (connexion → inscription, R2), le focus revient où il était au lieu de se perdre.
   */
  focusOnMount?: boolean
  /**
   * R10 : l'identifiant du panneau, quand il est dessiné ailleurs (le Fil, sous les pastilles des
   * ruches). Chaque onglet le commande (`aria-controls`) ; aucun panneau n'est dessiné ici, et le
   * `content` des onglets est ignoré. L'écran pose cet identifiant (`nativeID`) sur son panneau.
   */
  panelId?: string
  /**
   * R10 : une seule ligne d'onglets, qui défile de côté si elle ne tient pas, et qui montre toujours
   * l'onglet choisi en entier. La capsule prend la largeur de ses onglets, jusqu'à toute la place.
   */
  scroll?: boolean
  /**
   * R16 (« Les squelettes », planche R16-Fil-1440) : des pièces posées après les onglets, dans la
   * même capsule et, avec `scroll`, dans la même bande : les pastilles vides des ruches à venir,
   * après « Tout », pendant la lecture des ruches. Hors de la liste d'onglets : ce ne sont pas des
   * onglets, elles ne se lisent pas (au composant qui les donne de les cacher) ni ne se touchent.
   */
  trailing?: ReactNode
}

type KeyEvent = { key: string; preventDefault: () => void }

/** La place d'un onglet dans la bande qui défile : son début et sa largeur, en points. */
type Place = { x: number; width: number }

/**
 * Le libellé d'un onglet. L'onglet choisi : l'encre sur la goutte, jour et nuit (paire onHoney /
 * surfaceRaised de packages/brand/src/colors.ts), comme dans Segmented.
 */
const labelText = (label: string, chosen: boolean) => (
  <Text
    variant="callout"
    weight={chosen ? 700 : 500}
    tone={chosen ? 'onHoney' : 'muted'}
    align="center"
    selectable={false}
  >
    {label}
  </Text>
)

export function Tabs<K extends string>({
  label,
  tabs,
  selected,
  onSelect,
  variant = 'glass',
  focusOnMount = false,
  panelId: externalPanel,
  scroll = false,
  trailing,
}: Props<K>) {
  const { colors, shadows } = useTheme()
  // fontScale : la taille de texte choisie sur l'appareil. Très agrandis, les onglets vont à la
  // ligne plutôt que de se chevaucher (sauf dans la bande qui défile : elle s'allonge et défile).
  const { fontScale } = useWindowDimensions()
  const large = fontScale >= 1.5 && !scroll
  // useId : un identifiant unique et stable entre le serveur et le navigateur (la page web est
  // pré-rendue), pour relier chaque onglet à son panneau.
  const id = useId()
  const tabId = (key: K) => `${id}-tab-${key}`
  const panelId = (key: K) => externalPanel ?? `${id}-panel-${key}`
  // Les onglets, pour y poser le focus quand une flèche passe au voisin.
  const refs = useRef<(View | null)[]>([])

  // Le seul onglet que Tab atteint : l'onglet choisi (le premier, si la clé n'est pas parmi les
  // onglets).
  const selectedIndex = tabs.findIndex((tab) => tab.key === selected)
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex

  // La bande qui défile (`scroll`) : sa largeur visible, sa position, le début de la rangée dans la
  // bande et la place de chaque onglet, gardés dans des refs (les lire ne redessine rien).
  const scroller = useRef<ScrollView>(null)
  const viewport = useRef(0)
  const offset = useRef(0)
  const rowX = useRef(0)
  const places = useRef(new Map<K, Place>())
  // Vrai tant que l'onglet choisi n'a pas encore été montré dans la bande : au premier affichage,
  // les mesures arrivent après le rendu, et c'est la dernière qui le montre. Une fois montré, une
  // nouvelle mesure (la bande qui change de largeur) ne fait plus défiler : rien ne bouge sous le
  // doigt du membre qui a fait glisser la bande sans rien choisir.
  const pending = useRef(true)
  const calm = useCalmMotion()
  /** Amène l'onglet choisi en entier dans la bande (glissé, sauf « Réduire les animations »). */
  const reveal = (animated: boolean) => {
    const chosen = tabs[tabStop]
    const place = chosen ? places.current.get(chosen.key) : undefined
    if (!place || viewport.current <= 0) return
    pending.current = false
    // De l'air de chaque côté (l'onglet élargi de `space.lg`) : l'onglet voisin dépasse un peu,
    // signe que la bande continue.
    // Un onglet aussi large que la bande (un nom long, à 200 %) : sans air, calé sur son début.
    const start = rowX.current + place.x
    const roomy = place.width + 2 * space.lg <= viewport.current
    const target = roomy
      ? scrollToShow(
          { x: Math.max(0, start - space.lg), width: place.width + 2 * space.lg },
          viewport.current,
          offset.current,
        )
      : Math.abs(offset.current - start) < 1
        ? null
        : start
    if (target === null) return
    scroller.current?.scrollTo({ x: target, animated: animated && !calm })
    // La position demandée devient la position connue : sur téléphone, `onScroll` la confirmera.
    offset.current = target
  }
  // Un autre onglet choisi (un toucher, les flèches, ou l'écran qui lit l'adresse) : la bande le
  // montre. Au premier rendu, rien n'est encore mesuré : ce sont les mesures (plus bas) qui le
  // montrent, sans glisser.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul l'onglet choisi décide ; `reveal` ne lit que des refs.
  useEffect(() => {
    if (!scroll) return
    pending.current = true
    reveal(true)
  }, [selected, scroll])
  // Une mesure arrivée : la bande montre l'onglet choisi s'il ne l'a pas encore été, ou si une
  // taille a changé (le texte agrandi dans les réglages, la fenêtre tournée) : l'onglet choisi,
  // élargi, sortait alors de la bande. Le membre qui fait glisser la bande ne change aucune taille.
  const measured = (resized: boolean) => {
    if (pending.current || resized) reveal(false)
  }
  // La largeur visible de la bande, aussi en état : un onglet n'est jamais plus large qu'elle (un
  // nom long, à 200 %, passe à la ligne dans sa pastille au lieu de sortir de la bande).
  const [bandWidth, setBandWidth] = useState(0)
  // R16 (les sauts du Fil) : les onglets dont la bande a été mesurée avec eux. La bande prend la
  // largeur de ses onglets : quand les ruches arrivent après « Tout », la largeur connue est encore
  // celle de « Tout » seul. Bornés à elle, « Famille » et « Amis du jeudi » passaient à la ligne,
  // la rangée grandissait de 27 points le temps d'une mesure, puis rétrécissait, et le Fil dessous
  // descendait puis remontait. Un onglet neuf n'est donc borné qu'après la mesure suivante de la
  // rangée (qui change de largeur dès qu'un onglet s'ajoute) ; la largeur de la bande lue alors
  // est la bonne.
  const [measuredTabs, setMeasuredTabs] = useState<ReadonlySet<string>>(() => new Set())

  // Choisir l'onglet de rang `index` et lui donner le focus (flèches, Début, Fin).
  const go = (index: number) => {
    const tab = tabs[index]
    if (!tab) return
    onSelect(tab.key)
    // Sans défilement : la page reste où elle est, l'onglet est déjà en vue (dans la bande, c'est
    // `reveal` qui le montre, en glissant).
    focusWithoutScroll(refs.current[index])
  }

  // Sur le web : les flèches, Début et Fin, et la barre d'espace. Entrée, react-native-web la gère
  // déjà ; Espace, il ne l'active que pour role="button" : sans `spaceToggles`, Espace sur un onglet
  // ne faisait rien et faisait défiler la page (relecture R2, C2).
  const webProps = (index: number) =>
    Platform.OS === 'web'
      ? {
          tabIndex: index === tabStop ? (0 as const) : (-1 as const),
          onKeyDown: (event: KeyEvent) => {
            const choose = tabs[index]
            if (event.key === ' ' && choose) {
              const space = spaceToggles(() => onSelect(choose.key)) as {
                onKeyDown?: (spaceEvent: KeyEvent) => void
              }
              space.onKeyDown?.(event)
              return
            }
            const last = tabs.length - 1
            const target =
              event.key === 'ArrowRight'
                ? index === last
                  ? 0
                  : index + 1
                : event.key === 'ArrowLeft'
                  ? index === 0
                    ? last
                    : index - 1
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : null
            if (target === null) return
            // preventDefault : la flèche ne fait pas défiler la page.
            event.preventDefault()
            go(target)
          },
        }
      : null

  const current = tabs[tabStop]

  // Une seule fois, à l'affichage : la valeur de départ de `focusOnMount` compte, pas ses
  // changements (le focus ne saute pas pendant qu'on lit).
  const focusAtStart = useRef(focusOnMount)
  const startIndex = useRef(tabStop)
  useEffect(() => {
    if (focusAtStart.current) focusWithoutScroll(refs.current[startIndex.current])
  }, [])

  // La rangée : rôle « tablist ». Pas d'`accessible` : sur iOS, VoiceOver doit atteindre chaque
  // onglet, pas la rangée d'un bloc.
  const row = (
    <View
      role="tablist"
      aria-label={label}
      // Dans la bande, la rangée mesure son début (l'air de la bande avant elle).
      onLayout={
        scroll
          ? (event: LayoutChangeEvent) => {
              const { x } = event.nativeEvent.layout
              const resized = x !== rowX.current
              rowX.current = x
              // La rangée vient d'être posée avec ces onglets : chacun peut être borné à la bande.
              setMeasuredTabs((known) =>
                tabs.every((tab) => known.has(tab.key))
                  ? known
                  : new Set(tabs.map((tab) => tab.key)),
              )
              measured(resized)
            }
          : undefined
      }
      style={{
        flexDirection: 'row',
        // Dans la bande, une seule ligne ; sinon, les onglets passent à la ligne.
        flexWrap: scroll ? 'nowrap' : 'wrap',
        gap: space.xxs,
      }}
    >
      {tabs.map((tab, index) => {
        const chosen = index === tabStop
        return (
          <Pressable
            key={tab.key}
            ref={(node) => {
              refs.current[index] = node
            }}
            nativeID={tabId(tab.key)}
            role="tab"
            accessibilityLabel={tab.spokenLabel ?? tab.label}
            aria-selected={chosen}
            // Le panneau que l'onglet commande (`aria-controls` manque aux types de React
            // Native ; sur téléphone, la propriété est ignorée).
            {...{ 'aria-controls': panelId(tab.key) }}
            onPress={() => onSelect(tab.key)}
            // Dans la bande : chaque onglet mesure sa place, pour que la bande montre le choisi.
            onLayout={
              scroll
                ? (event: LayoutChangeEvent) => {
                    const { x, width } = event.nativeEvent.layout
                    const before = places.current.get(tab.key)
                    places.current.set(tab.key, { x, width })
                    // L'onglet choisi, ou un onglet avant lui qui change de taille (il le pousse).
                    const resized =
                      before !== undefined && (before.x !== x || before.width !== width)
                    if (chosen || (resized && index < tabStop)) measured(resized)
                  }
                : undefined
            }
            {...webProps(index)}
            // Dans la bande, l'anneau du focus est dessiné à l'intérieur de l'onglet : la bande qui
            // défile rognerait un anneau posé autour. La goutte est blanche (pas miel) : il s'y voit.
            {...(scroll ? insetFocus : null)}
            style={{
              // Les onglets se partagent la largeur ; chacun part de la taille de son texte
              // (flexBasis auto) et passe à la ligne s'il ne tient plus. Très agrandis, chacun
              // sa ligne entière. Dans la bande, chacun garde la taille de son texte.
              flexGrow: scroll ? 0 : 1,
              flexShrink: 0,
              ...(scroll && bandWidth > 0 && measuredTabs.has(tab.key)
                ? { maxWidth: bandWidth }
                : null),
              flexBasis: large ? '100%' : 'auto',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: layout.touchTarget,
              paddingHorizontal: space.lg,
              paddingVertical: space.xs,
              borderRadius: radii.pill,
              // Avec une icône : l'icône et le libellé côte à côte, centrés ensemble.
              ...(tab.icon ? { flexDirection: 'row' as const, gap: space.xs } : null),
              ...(chosen
                ? { backgroundColor: colors.surfaceRaised, boxShadow: shadows.soft }
                : null),
            }}
          >
            {/* L'icône, décorative (Icon est caché des lecteurs d'écran) : de la couleur du
                libellé. Dans sa propre vue qui ne rétrécit pas : sur le web, un <svg> seul dans
                une rangée se fait écraser par un libellé long, agrandi à 200 %. */}
            {tab.icon ? (
              <View style={{ flexShrink: 0 }}>
                <Icon name={tab.icon} size={ICON_SIZE} tone={chosen ? 'onHoney' : 'muted'} />
              </View>
            ) : null}
            {/* À côté d'une icône, le libellé rétrécit et passe à la ligne plutôt que de
                déborder ; sans icône, il est posé tel quel, comme avant R7b. */}
            {tab.icon ? (
              <View style={{ flexShrink: 1, minWidth: 0 }}>{labelText(tab.label, chosen)}</View>
            ) : (
              labelText(tab.label, chosen)
            )}
          </Pressable>
        )
      })}
    </View>
  )

  // Les pièces d'après (`trailing`), à côté de la rangée, à l'écart des onglets entre eux ; la
  // rangée garde sa place en tête (son début mesuré dans la bande ne change pas).
  const band =
    trailing === undefined ? (
      row
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        {row}
        {trailing}
      </View>
    )

  // La capsule de verre. Dans la bande, elle prend la largeur de ses onglets, jusqu'à toute la
  // place (`maxWidth`), et ses onglets défilent dedans au-delà.
  const capsule = scroll ? (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%', flexShrink: 1 }}>
      <Surface variant={variant} radius="pill" padding="xxs">
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(event: LayoutChangeEvent) => {
            const { width } = event.nativeEvent.layout
            const resized = viewport.current > 0 && width !== viewport.current
            viewport.current = width
            setBandWidth(width)
            measured(resized)
          }}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            offset.current = event.nativeEvent.contentOffset.x
          }}
          // Une position lue au plus toutes les 16 ms (une image) pendant le défilement.
          scrollEventThrottle={16}
          style={{ flexGrow: 0 }}
        >
          {band}
        </ScrollView>
      </Surface>
    </View>
  ) : (
    <Surface variant={variant} radius={large ? 'group' : 'pill'} padding="xxs">
      {band}
    </Surface>
  )

  // Panneau porté ailleurs : la rangée seule.
  if (externalPanel !== undefined) return capsule

  return (
    <View style={{ gap: space.xl }}>
      {capsule}
      {/* Un seul panneau : celui de l'onglet choisi, nommé par son onglet. Changer d'onglet le
          remplace (clé) : les champs d'un formulaire ne gardent pas la saisie de l'autre. */}
      {current ? (
        <View
          key={current.key}
          nativeID={panelId(current.key)}
          role="tabpanel"
          aria-labelledby={tabId(current.key)}
        >
          {current.content}
        </View>
      ) : null}
    </View>
  )
}

type PanelProps = {
  /**
   * L'identifiant que les onglets citent (`panelId`) ; absent quand il n'y a pas d'onglets (un
   * membre sans ruche) : une simple vue, sans rôle ni nom.
   */
  id?: string | undefined
  /** Le nom du panneau : celui de l'onglet choisi (« Famille »). */
  label?: string | undefined
  children: ReactNode
}

/**
 * R10 : le panneau d'onglets porté par l'écran (`panelId`), le Fil sous les pastilles des ruches.
 * Le rôle `tabpanel` et le nom de l'onglet choisi (`aria-label` : l'identifiant de l'onglet est
 * interne à la rangée, `aria-labelledby` ne peut pas le citer). Sans `id`, la même vue sans rôle :
 * l'arbre ne change pas quand les onglets arrivent (les ruches lues après le Fil), et la liste
 * dessous garde sa mémoire des cartes déjà vues.
 */
export function TabPanel({ id, label, children }: PanelProps) {
  return (
    <View
      {...(id ? { nativeID: id, role: 'tabpanel' as const } : null)}
      {...(id && label ? { 'aria-label': label } : null)}
    >
      {children}
    </View>
  )
}
