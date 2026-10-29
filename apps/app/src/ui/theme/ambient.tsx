// La source de la lumière d'ambiance (Miel 2) : ce qui la colore, et ses impulsions. Un écran dit
// « la lumière vient de cette image » (son résumé flou, le thumbhash) ou « de ces trois couleurs »,
// et la lumière glisse vers elles ; une action marquante (publier, réagir) la ravive d'une
// impulsion. Sans source, c'est la lumière miel.
//
// Chaque écran (ui/Screen.tsx) monte son propre fournisseur : sur le web, la page précédente reste
// montée sous la nouvelle, et chacune garde ainsi sa lumière. Un composant de l'écran y accède par
// useAmbient() ; la lumière elle-même (AmbientLight) lit la source par useAmbientSource().
import { palettes } from '@ruche/brand'
// Le décodeur de résumés flous (thumbhash) fourni avec expo-image : le même algorithme que le paquet
// `thumbhash` de l'API (Evan Wallace, licence MIT), déjà présent dans l'appli. On ne prend que
// cette fonction, qui transforme le résumé en une minuscule image (au plus 32 × 32 points).
import { thumbHashToRGBA } from 'expo-image/src/utils/thumbhash/thumbhash'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

/** Trois couleurs (#rrggbb) : la principale, la claire, la profonde. */
export type AmbientPalette = readonly [string, string, string]

/** D'où vient la lumière : le résumé flou d'une image, trois couleurs, ou rien (le miel). */
export type AmbientSource = { thumbhash: string } | { palette: AmbientPalette } | null

/** La lumière miel, tirée des jetons : le miel, le pollen, le miel appuyé. */
export const honeyPalette: AmbientPalette = [
  palettes.day.honey,
  palettes.day.honeyLight,
  palettes.day.honeyPressed,
]

// Deux impulsions à moins de 350 ms n'en font qu'une (J11) : une rafale (dix réactions d'affilée)
// ne fait pas clignoter la lumière.
const PULSE_MERGE_MS = 350

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Les trois couleurs d'une source. Un résumé illisible (corrompu, trop court) ou une palette qui
 * n'est pas faite de trois #rrggbb donnent la lumière miel : une donnée venue de l'API ne casse
 * jamais l'écran.
 */
export function sourcePalette(source: AmbientSource): AmbientPalette {
  if (source === null) return honeyPalette
  if ('palette' in source) {
    return source.palette.length === 3 && source.palette.every((color) => HEX.test(color))
      ? source.palette
      : honeyPalette
  }
  return thumbhashPalette(source.thumbhash) ?? honeyPalette
}

/** Deux sources identiques ? (Pour ne pas relancer le fondu quand rien n'a changé.) */
export function sameSource(a: AmbientSource, b: AmbientSource): boolean {
  if (a === null || b === null) return a === b
  if ('thumbhash' in a) return 'thumbhash' in b && a.thumbhash === b.thumbhash
  return 'palette' in b && a.palette.every((color, index) => color === b.palette[index])
}

// ---------------------------------------------------------------------------------------------
// Le résumé flou → trois couleurs

/** Le texte en base64 du résumé, en octets ; null s'il n'est pas du base64. */
const base64Bytes = (text: string): Uint8Array | null => {
  if (text.length === 0 || text.length > 100 || typeof globalThis.atob !== 'function') return null
  try {
    const binary = globalThis.atob(text)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Le nombre d'octets qu'un résumé doit avoir, lu dans son en-tête. Le décodeur ne vérifie rien : un
 * résumé tronqué (« AAAA ») se décode sans erreur en une image fausse. On recompte donc, comme lui,
 * les coefficients que l'en-tête annonce (quatre bits chacun).
 */
const expectedLength = (hash: Uint8Array): number => {
  const header24 = (hash[0] ?? 0) | ((hash[1] ?? 0) << 8) | ((hash[2] ?? 0) << 16)
  const header16 = (hash[3] ?? 0) | ((hash[4] ?? 0) << 8)
  const hasAlpha = header24 >> 23 !== 0
  const isLandscape = header16 >> 15 !== 0
  const lx = Math.max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7)
  const ly = Math.max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7)
  // Le nombre de coefficients d'un canal de nx × ny (la boucle du décodeur, sans le premier).
  const count = (nx: number, ny: number) => {
    let n = 0
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) n++
    }
    return n
  }
  const nibbles = count(lx, ly) + 2 * count(3, 3) + (hasAlpha ? count(5, 5) : 0)
  return (hasAlpha ? 6 : 5) + Math.ceil(nibbles / 2)
}

/** Les trois couleurs dominantes d'un résumé, ou null s'il est illisible. */
const thumbhashPalette = (thumbhash: string): AmbientPalette | null => {
  const hash = base64Bytes(thumbhash)
  if (!hash || hash.length < 5 || hash.length < expectedLength(hash)) return null
  try {
    const { w, h, rgba } = thumbHashToRGBA(hash)
    // Le résultat est vérifié lui aussi : une taille plausible, autant de points que promis.
    if (!(w > 0 && h > 0 && w <= 100 && h <= 100) || rgba.length !== w * h * 4) return null
    return dominantColors(rgba)
  } catch {
    return null
  }
}

type Rgb = [number, number, number]

/**
 * Trois couleurs d'une petite image : ses points rangés du plus sombre au plus clair, puis la
 * moyenne de chaque tiers. Le tiers du milieu donne la couleur principale, le plus clair la claire,
 * le plus sombre la profonde (l'ordre de la palette miel). Les couleurs d'un résumé flou sont un
 * peu ternes : on les ravive.
 */
const dominantColors = (rgba: Uint8Array): AmbientPalette | null => {
  const points: Rgb[] = []
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    points.push([rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0])
  }
  if (points.length < 3) return null
  points.sort((a, b) => luminance(a) - luminance(b))
  const third = Math.floor(points.length / 3)
  const mean = (from: number, to: number) => {
    const slice = points.slice(from, to)
    return [0, 1, 2].map(
      (channel) => slice.reduce((sum, point) => sum + (point[channel] ?? 0), 0) / slice.length,
    ) as Rgb
  }
  const [deep, main, light] = [
    mean(0, third),
    mean(third, points.length - third),
    mean(points.length - third, points.length),
  ].map((color) => toHex(saturate(color)))
  if (!deep || !main || !light) return null
  return [main, light, deep]
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** Éloigne une couleur de son gris (×1,6), comme le faisait le filtre `saturate` de la lumière. */
const saturate = (color: Rgb): Rgb => {
  const gray = luminance(color)
  return color.map((channel) => gray + (channel - gray) * 1.6) as Rgb
}

const toHex = (color: Rgb): string | null => {
  if (!color.every(Number.isFinite)) return null
  return `#${color
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

// ---------------------------------------------------------------------------------------------
// Le fournisseur

type Ambient = {
  /** Change la source : la lumière glisse vers elle (900 ms). null : la lumière miel. */
  setSource: (source: AmbientSource) => void
  /** Ravive la lumière un instant ; `force` entre 0 et 1 (1 par défaut). */
  pulse: (force?: number) => void
}

type PulseListener = (force: number) => void

type AmbientState = {
  source: AmbientSource
  /** S'abonner aux impulsions (déjà fusionnées) ; renvoie de quoi se désabonner. */
  onPulse: (listener: PulseListener) => () => void
}

// Deux contextes : les actions ne changent jamais (un bouton qui appelle pulse() n'est pas
// redessiné quand la source change), l'état ne sert qu'à la lumière.
const AmbientActions = createContext<Ambient | null>(null)
const AmbientStateContext = createContext<AmbientState | null>(null)

const inert: Ambient = { setSource: () => {}, pulse: () => {} }
const noSource: AmbientState = { source: null, onPulse: () => () => {} }

export function AmbientProvider({
  initialSource = null,
  children,
}: {
  /** La source du premier affichage, sans fondu (l'image du projet déjà connue). */
  initialSource?: AmbientSource
  children: ReactNode
}) {
  const [source, setSourceState] = useState<AmbientSource>(initialSource)
  // Les abonnés aux impulsions, et l'heure de la dernière impulsion jouée. Des « refs » : des
  // valeurs gardées d'un affichage à l'autre, dont le changement ne redessine rien.
  const listeners = useRef(new Set<PulseListener>())
  const lastPulse = useRef(Number.NEGATIVE_INFINITY)

  const setSource = useCallback((next: AmbientSource) => {
    setSourceState((current) => (sameSource(current, next) ? current : next))
  }, [])

  const pulse = useCallback((force = 1) => {
    const now = Date.now()
    if (now - lastPulse.current < PULSE_MERGE_MS) return
    lastPulse.current = now
    // Une force bornée : jamais plus que l'impulsion pleine, jamais négative.
    const bounded = Number.isFinite(force) ? Math.min(1, Math.max(0, force)) : 1
    for (const listener of listeners.current) listener(bounded)
  }, [])

  const onPulse = useCallback((listener: PulseListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const actions = useMemo(() => ({ setSource, pulse }), [setSource, pulse])
  const state = useMemo(() => ({ source, onPulse }), [source, onPulse])
  return (
    <AmbientActions.Provider value={actions}>
      <AmbientStateContext.Provider value={state}>{children}</AmbientStateContext.Provider>
    </AmbientActions.Provider>
  )
}

/**
 * Hook : changer la source de la lumière, ou la raviver. Hors d'un écran (sans fournisseur), ces
 * gestes ne font rien.
 */
export const useAmbient = (): Ambient => useContext(AmbientActions) ?? inert

/** Hook de la lumière elle-même : la source à dessiner et ses impulsions. */
export const useAmbientSource = (): AmbientState => useContext(AmbientStateContext) ?? noSource

/** Ce qu'on peut donner directement à une lumière, au lieu de la source de l'écran. */
export type AmbientLightProps = {
  /** Le résumé flou d'un visuel (une lumière posée dans une carte, au catalogue). */
  thumbhash?: string | null
  /** Une source complète. */
  source?: AmbientSource
}

/** Hook : la source d'une lumière : la sienne si on la lui donne, sinon celle de l'écran. */
export const useLightSource = ({ thumbhash, source }: AmbientLightProps): AmbientSource => {
  const shared = useAmbientSource().source
  if (source !== undefined) return source
  if (thumbhash !== undefined) return thumbhash ? { thumbhash } : null
  return shared
}
