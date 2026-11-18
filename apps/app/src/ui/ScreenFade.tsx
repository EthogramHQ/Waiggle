// Le fondu des pages sur le web (tranche RF, « Les pages apparaissent en fondu ») : quand le membre
// ouvre une page dans l'appli, ou revient sur une page restée dans la pile, son contenu passe de
// l'opacité 0 à 1 en `durations.page` (180 ms), sur la courbe `exit` (vite, puis en douceur). La
// barre du haut et la lumière, qui restent en place d'une page à l'autre, ne s'effacent pas : seul
// le contenu, autour duquel `Screen` pose ce composant, fond.
//
// Les règles (scénario RF et relecture du plan) :
// - le fondu suit la **route** (`useScreenShownCount`, ui/screenFocus.ts) et non le montage : un
//   écran monté pendant une visite déjà commencée (la fin d'un chargement, le passage de 1 100 px,
//   la page d'erreur) arrive sans fondu (ui-1) ;
// - jamais la première page de la visite (un lien reçu, un rechargement) : son HTML pré-rendu
//   s'affiche tout de suite, et n'est jamais à l'opacité 0 ;
// - l'opacité 0 est posée par le rendu même qui montre la page, avant toute image, à l'aller comme
//   au retour : pas d'éclair de la page pleine (ui-11) ;
// - la page est pleine 400 ms après le début au plus tard, même si l'animation ne finit pas
//   (jur-RF5), et ne prend aucun clic tant qu'elle n'est pas pleine (S1) ;
// - « Réduire les animations » garde le fondu : ce n'est pas un déplacement ;
// - sur iOS et Android, rien : la pile garde son glissement natif ;
// - R14 : au retour d'un projet ouvert par une carte de la page, pas de fondu, « Réduire les
//   animations » compris. La page, restée dans la pile, est déjà là au même endroit ; la refondre
//   montrait une page vide entre les deux. Ses cartes le disent par un drapeau de la page
//   (`useCoverReturn`, ui/coverTransition.tsx), que `Screen` pose une fois pour tous ses fondus ;
//   le retour suivant, par un autre chemin, refond.
//
// Le contenu reste présent et lisible par le lecteur d'écran pendant le fondu : seule l'opacité
// change, le focus du clavier n'est pas touché.
import { durations, easings, space } from '@ruche/brand'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { CoverReturnScope, useCoverReturn } from './coverTransition'
import { type ArrivalStyle, arrivalStyle } from './pageTransition'
import { useScreenShownCount } from './screenFocus'
import { useCalmMotion } from './theme/motion'

/** Vrai si la page qui arrive de cette façon fond d'elle-même (sans l'API View Transitions). */
const fades = (how: ArrivalStyle) => how === 'fade-up' || how === 'fade'

/**
 * Le temps au bout duquel la page est pleine quoi qu'il arrive (jur-RF5), compté depuis le début du
 * fondu, ou depuis le montage d'une page qui attend son arrivée.
 */
export const PAGE_FADE_LIMIT_MS = 400

// La garde pose l'opacité 1 un peu avant la limite : la nouvelle valeur ne se voit qu'à l'image
// suivante (Reanimated l'applique à la prochaine image), et doit être à l'écran à 400 ms. Deux
// images de 60 Hz de marge.
const GUARD_MS = PAGE_FADE_LIMIT_MS - 34

/**
 * Le drapeau du module : une page a-t-elle déjà été affichée pendant cette visite ? Faux au
 * chargement (et pendant tout le pré-rendu, qui ne lance aucun effet) : la première page ne fond
 * pas. Il passe à vrai dès qu'une page est arrivée, dans un effet, donc jamais sur le serveur.
 */
let pageShownBefore = false

// Les phases du fondu :
// - `rest` : la page est pleine, prend les clics ;
// - `waiting` : montée avant son arrivée (une route neuve, nombre 0), elle attend invisible ;
// - `armed` : elle vient d'arriver ; l'opacité 0 est posée par ce rendu, l'animation part dans
//   l'effet qui suit, et la couche fixe ne s'efface qu'une image plus tard, quand la valeur animée
//   est à l'écran ;
// - `fading` : l'animation va de 0 à 1.
type Phase = 'rest' | 'waiting' | 'armed' | 'fading'

type Props = {
  children: ReactNode
  /** Faux : jamais de fondu (la page d'un projet ouverte depuis une carte, qui a son passage). */
  fade?: boolean
  /** Le placement donné par le parent (`flexGrow`…). */
  style?: StyleProp<ViewStyle>
}

/** Autour du contenu d'un écran : le fait apparaître en fondu quand sa route devient affichée. */
export function ScreenFade({ children, fade = true, style }: Props) {
  const web = Platform.OS === 'web'
  const count = useScreenShownCount()
  // Le drapeau de la page (R14) : une de ses cartes a ouvert un projet depuis la dernière arrivée.
  const back = useCoverReturn()
  // L'état garde le dernier nombre vu, pour reconnaître une arrivée (un nombre qui monte) au rendu
  // même qui la montre. Au montage : une route neuve (0) attend invisible, sauf sur la première page
  // de la visite ; une route déjà affichée (1 et plus) est là, sans fondu.
  // R17 : sous « Réduire les animations », jamais de déplacement, un fondu seul.
  const calm = useCalmMotion()
  // R17 : la page n'attend invisible que si elle doit fondre. Le navigateur qui anime le passage
  // (`vt`) la photographie : vide, il photographierait une page vide.
  const [state, setState] = useState<{ seen: number; phase: Phase; rise: boolean }>(() => {
    const how = arrivalStyle()
    return {
      seen: count,
      phase: count === 0 && pageShownBefore && fades(how) ? 'waiting' : 'rest',
      rise: how === 'fade-up' && !calm,
    }
  })
  let { phase, rise } = state
  if (count !== state.seen) {
    // Une arrivée : la page fond, sauf la première arrivée d'une page montée sans attendre (la
    // première de la visite). Un « setState » pendant le rendu : React recommence aussitôt ce rendu
    // avec le nouvel état, avant de rien poser à l'écran.
    // R14 : le retour d'un projet ouvert par une carte de la page arrive sans fondu. Le drapeau est
    // seulement lu ici (un rendu peut se jouer deux fois) ; il retombe dans l'effet plus bas.
    // R17 : la sorte de l'arrivée vient du moteur des passages (ui/pageTransition) : le navigateur
    // anime (`vt`) ou la page d'avant revient (`none`) : là tout de suite ; sinon, un fondu, en
    // montant de 12 points vers une page plus profonde (`fade-up`), sur place entre deux onglets.
    const how = arrivalStyle()
    const arrival = count > state.seen && (state.seen > 0 || state.phase === 'waiting')
    phase = arrival && !back.opened && fades(how) ? 'armed' : 'rest'
    rise = how === 'fade-up' && !calm
    setState({ seen: count, phase, rise })
  }
  const active = web && fade && phase !== 'rest'

  // L'opacité animée (une « valeur partagée » de Reanimated : elle vit sur le fil des animations).
  const level = useSharedValue(1)
  // R17 : le déplacement vertical de la page qui monte (de `space.md` à 0, sans l'API View
  // Transitions). Au repos, aucune transformation : une transformation, même nulle, ferait du
  // contenu le cadre de ses éléments `position: fixed` sur le web.
  const shift = useSharedValue(0)
  const animated = useAnimatedStyle(() => ({
    opacity: level.value,
    transform: shift.value === 0 ? [] : [{ translateY: shift.value }],
  }))
  // Le numéro du fondu en cours : une fin d'animation arrivée après un fondu plus récent ne compte
  // pas.
  const run = useRef(0)

  // La première arrivée vue : les pages suivantes fondront.
  useLayoutEffect(() => {
    if (count > 0) pageShownBefore = true
  }, [count])

  // R14 : le drapeau de la page retombe à chaque arrivée (un nombre qui change), une fois que tous
  // ses fondus l'ont lu : ils se rendent tous avant le premier de ces effets. Pas au montage : un
  // fondu monté pendant la visite du projet (passage en colonnes) ne l'efface pas avant le retour.
  const lastCount = useRef(count)
  useLayoutEffect(() => {
    if (count === lastCount.current) return
    lastCount.current = count
    back.opened = false
  }, [count, back])

  // L'arrivée : l'animation part de 0, avant la première image. Rien sans fondu (téléphone,
  // `fade={false}`).
  useLayoutEffect(() => {
    if (phase !== 'armed') return
    if (!web || !fade) {
      setState((s) => ({ ...s, phase: 'rest' }))
      return
    }
    run.current += 1
    const id = run.current
    const settle = (finished: number) => {
      if (finished === run.current) setState((s) => ({ ...s, phase: 'rest' }))
    }
    // R17 : la page plus profonde monte en `base` (320 ms, le prototype B validé) ; le fondu sur
    // place, ou sous « Réduire les animations », dure `page` (180 ms).
    const timing = {
      duration: rise ? durations.base : durations.page,
      easing: Easing.bezier(...easings.exit),
      // Sans lui, Reanimated sauterait le fondu quand l'appareil demande moins de mouvement.
      reduceMotion: ReduceMotion.Never,
    }
    level.value = 0
    level.value = withTiming(1, timing, (finished) => {
      'worklet'
      if (finished) scheduleOnRN(settle, id)
    })
    shift.value = rise ? space.md : 0
    if (rise) shift.value = withTiming(0, timing)
    // La couche fixe à 0 attend une image : la valeur animée n'est à l'écran qu'à l'image suivante.
    const frame = requestAnimationFrame(() =>
      setState((s) => (s.phase === 'armed' ? { ...s, phase: 'fading' } : s)),
    )
    return () => cancelAnimationFrame(frame)
  }, [phase, web, fade, level, shift, rise])

  // La garde (jur-RF5) : pleine au plus tard 400 ms après le début (ou le montage d'une page qui
  // attend), même si l'animation ne finit pas. Posée directement, sans animation. Le minuteur repart
  // à chaque arrivée (le nombre vu change), pas au passage de `armed` à `fading`, qui est le même
  // fondu.
  const guarded = phase !== 'rest'
  const since = state.seen
  // biome-ignore lint/correctness/useExhaustiveDependencies: `since` relance la garde à chaque arrivée
  useEffect(() => {
    if (!guarded) return
    const timer = setTimeout(() => {
      run.current += 1
      level.value = 1
      shift.value = 0
      setState((s) => ({ ...s, phase: 'rest' }))
    }, GUARD_MS)
    return () => clearTimeout(timer)
  }, [guarded, since, level, shift])

  // Deux couches : l'extérieure porte l'opacité fixe (0 tant que l'animation n'est pas à l'écran),
  // l'intérieure l'opacité animée. pointerEvents en propriété, jamais en style : le web ignorerait
  // la règle des enfants.
  //
  // Les clics (S1) : sur le web, `pointerEvents="none"` ne s'applique qu'à la couche et à ses
  // enfants directs (react-native-web écrit `>* { pointer-events: none }`) ; plus bas, une vue
  // `box-none` (le lien « Tester » d'une carte, son auteur) rend les clics à ses enfants. Pendant le
  // fondu, un bouclier transparent se pose donc par-dessus tout le contenu et prend chaque clic :
  // muet pour les lecteurs d'écran, hors de la touche Tab, retiré dès que la page est pleine. Le
  // contenu forme alors sa propre pile (`zIndex: 0`) : les calques des cartes (`zIndex: 1`) restent
  // dessous. La couche garde aussi `none`, qui suffit dans l'appli de téléphone.
  const hidden = active && (phase === 'waiting' || phase === 'armed')
  return (
    // R17 : tant qu'elle attend, la page qui montera est déjà 12 points plus bas (sa place de
    // départ), posée par ce même rendu ; la couche animée prend le relais avec l'opacité.
    <View
      pointerEvents={active ? 'none' : 'auto'}
      style={[style, hidden ? styles.hidden : null, hidden && rise ? styles.lowered : null]}
    >
      <Animated.View style={[styles.fill, active ? styles.stack : null, web ? animated : null]}>
        {/* Les cartes du contenu lèvent le drapeau de la page (toujours posé : même arbre). */}
        <CoverReturnScope value={back}>{children}</CoverReturnScope>
      </Animated.View>
      {active ? (
        <View
          testID="fade-shield"
          pointerEvents="auto"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.shield}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // La couche extérieure prend la place que le parent lui donne (`style`), l'intérieure toute la
  // couche : le contenu se range comme sans elles.
  fill: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  hidden: { opacity: 0 },
  lowered: { transform: [{ translateY: space.md }] },
  // Une pile à part pour le contenu, le temps du fondu : rien en lui ne passe sur le bouclier.
  stack: { zIndex: 0 },
  // Le bouclier : toute la couche, par-dessus le contenu.
  shield: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
})
