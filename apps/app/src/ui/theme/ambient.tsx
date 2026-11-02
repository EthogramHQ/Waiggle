// La source de la lumière d'ambiance (Miel 2) : ce qui la colore, et ses impulsions. Un écran dit
// « la lumière vient de cette image » (son résumé flou, le thumbhash) ou « de ces trois couleurs »,
// et la lumière glisse vers elles ; une action marquante (publier, réagir) la ravive d'une
// impulsion. Sans source, c'est la lumière miel.
//
// Sur le web (tranche RF), une seule lumière est posée derrière toutes les pages, par l'hôte
// (ui/AmbientHost.tsx) : elle ne repart pas de zéro à chaque page. Chaque écran s'y inscrit
// (ScreenAmbient, plus bas) avec sa source et son envie de lumière ; l'hôte dessine celle de
// l'écran **devenu affiché en dernier**. Hors de l'hôte (téléphone, tests, catalogue), chaque
// écran garde son propre fournisseur (AmbientProvider) et sa propre lumière, comme avant.
// Dans les deux cas, un composant de l'écran parle à la lumière par useAmbient() ; la lumière
// elle-même (AmbientLight) lit la source par useAmbientSource().
import { palettes } from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
// Le décodeur de résumés flous : le paquet `thumbhash` (Evan Wallace, licence MIT), le même que
// celui qui les fabrique dans l'API. On le prend par son nom plutôt que par la copie interne
// d'expo-image, dont le chemin peut changer à chaque version. On ne prend que cette fonction, qui
// transforme le résumé en une minuscule image (au plus 32 × 32 points).
import { thumbHashToRGBA } from 'thumbhash'

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
  /**
   * Une lumière est-elle voulue ? Toujours vrai hors de l'hôte. Dans l'hôte (le web), faux quand
   * l'écran affiché n'en veut pas (le miel, `ambient={false}`) ou qu'aucun écran inscrit n'est
   * affiché : la source vaut alors `null`, et la lumière s'efface en fondu puis rend son canvas
   * (AmbientLight.web.tsx). `null` seul ne suffit pas à le dire : c'est aussi la lumière miel d'un
   * écran sans visuel (le Fil).
   */
  lit: boolean
  /** S'abonner aux impulsions (déjà fusionnées) ; renvoie de quoi se désabonner. */
  onPulse: (listener: PulseListener) => () => void
}

// Deux contextes : les actions ne changent jamais (un bouton qui appelle pulse() n'est pas
// redessiné quand la source change), l'état ne sert qu'à la lumière.
const AmbientActions = createContext<Ambient | null>(null)
const AmbientStateContext = createContext<AmbientState | null>(null)

const inert: Ambient = { setSource: () => {}, pulse: () => {} }
const noSource: AmbientState = { source: null, lit: true, onPulse: () => () => {} }

/**
 * Hook : le canal des impulsions, commun au fournisseur d'un écran et à l'hôte. `pulse` prévient
 * les abonnés (la lumière), en fusionnant les rafales ; `onPulse` abonne.
 */
function usePulseChannel() {
  // Les abonnés aux impulsions, et l'heure de la dernière impulsion jouée. Des « refs » : des
  // valeurs gardées d'un affichage à l'autre, dont le changement ne redessine rien.
  const listeners = useRef(new Set<PulseListener>())
  const lastPulse = useRef(Number.NEGATIVE_INFINITY)

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

  return { pulse, onPulse }
}

/**
 * Le fournisseur d'un écran hors de l'hôte (téléphone, tests, catalogue) : sa source à lui et ses
 * impulsions, que sa propre lumière lit.
 */
export function AmbientProvider({
  initialSource = null,
  children,
}: {
  /** La source du premier affichage, sans fondu (l'image du projet déjà connue). */
  initialSource?: AmbientSource
  children: ReactNode
}) {
  const [source, setSourceState] = useState<AmbientSource>(initialSource)
  const { pulse, onPulse } = usePulseChannel()

  const setSource = useCallback((next: AmbientSource) => {
    setSourceState((current) => (sameSource(current, next) ? current : next))
  }, [])

  const actions = useMemo(() => ({ setSource, pulse }), [setSource, pulse])
  const state = useMemo(() => ({ source, lit: true, onPulse }), [source, onPulse])
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

/** Hook de la lumière elle-même : la source à dessiner, si elle est voulue, et ses impulsions. */
export const useAmbientSource = (): AmbientState => useContext(AmbientStateContext) ?? noSource

// ---------------------------------------------------------------------------------------------
// L'hôte : une lumière pour toutes les pages (le web)

/** Ce que l'hôte sait d'un écran inscrit. */
type Registration = {
  /** La dernière source choisie par l'écran pendant qu'il était affiché. */
  source: AmbientSource
  /** L'écran veut-il une lumière ? (pas sur le miel, ni avec `ambient={false}`) */
  light: boolean
  /** L'écran est-il affiché, d'après le routeur ? */
  focused: boolean
  /** Le numéro du dernier passage à « affiché » : le plus grand gagne (ui-11). 0 : jamais. */
  shownAt: number
}

/** Le registre de l'hôte, tel que les écrans le voient : chaque geste porte l'identité de l'écran. */
type AmbientRegistry = {
  add: (id: string, entry: Omit<Registration, 'shownAt'>) => void
  remove: (id: string) => void
  setLight: (id: string, light: boolean) => void
  setFocused: (id: string, focused: boolean) => void
  setSource: (id: string, source: AmbientSource) => void
  pulse: (id: string, force?: number) => void
}

const AmbientRegistryContext = createContext<AmbientRegistry | null>(null)

/** Ce que l'hôte dessine : la source de l'écran retenu, et s'il veut une lumière. */
type Drawn = { id: string | null; source: AmbientSource; lit: boolean }

/**
 * L'écran dont l'hôte dessine la lumière : parmi les écrans affichés, celui qui l'est devenu en
 * dernier. Ce n'est pas « le premier qui se dit affiché » : pendant un changement de page, deux
 * écrans peuvent se dire affichés un court instant, et c'est le passage à « affiché », un
 * événement daté, qui départage (ui-11). Aucun écran affiché, ou l'écran retenu ne veut pas de
 * lumière : aucune lumière (source `null`, `lit` faux).
 */
const pickDrawn = (entries: Map<string, Registration>): Drawn => {
  let chosen: [string, Registration] | null = null
  for (const pair of entries) {
    const [, entry] = pair
    if (entry.focused && (chosen === null || entry.shownAt > chosen[1].shownAt)) chosen = pair
  }
  if (chosen === null || !chosen[1].light) return { id: null, source: null, lit: false }
  return { id: chosen[0], source: chosen[1].source, lit: true }
}

/**
 * Le fournisseur de l'hôte (ui/AmbientHost.tsx le pose, sur le web) : il tient le registre des
 * écrans et donne à la lumière commune (et aux lumières des cartes) la source de l'écran retenu et
 * les impulsions de cet écran-là.
 */
export function AmbientHostProvider({ children }: { children: ReactNode }) {
  // Le registre vit dans une ref : s'inscrire ou changer de source ne redessine pas l'hôte ; seul
  // un changement de ce qui est dessiné (`drawn`) le fait.
  const entries = useRef(new Map<string, Registration>())
  // Le compteur des passages à « affiché » : un numéro qui ne fait que monter.
  const shownCount = useRef(0)
  // Avant toute inscription (la page pré-rendue, le premier affichage), la lumière miel : c'est ce
  // que le serveur dessine, et le premier affichage du navigateur doit lui être identique.
  const [drawn, setDrawn] = useState<Drawn>({ id: null, source: null, lit: true })
  // L'écran dessiné, lu par `pulse` sans attendre un nouveau rendu.
  const drawnId = useRef<string | null>(null)
  const { pulse: pulseLight, onPulse } = usePulseChannel()

  const refresh = useCallback(() => {
    const next = pickDrawn(entries.current)
    drawnId.current = next.id
    setDrawn((current) =>
      current.id === next.id && current.lit === next.lit && sameSource(current.source, next.source)
        ? current
        : next,
    )
  }, [])

  const registry = useMemo<AmbientRegistry>(() => {
    const showIfFocused = (entry: Registration) => {
      if (entry.focused) {
        shownCount.current += 1
        entry.shownAt = shownCount.current
      }
    }
    return {
      add: (id, entry) => {
        const registration = { ...entry, shownAt: 0 }
        showIfFocused(registration)
        entries.current.set(id, registration)
        refresh()
      },
      // S3 : un écran démonté ne compte plus ; s'il était dessiné, l'écran affiché avant lui reprend
      // la lumière, ou plus rien.
      remove: (id) => {
        entries.current.delete(id)
        refresh()
      },
      setLight: (id, light) => {
        const entry = entries.current.get(id)
        if (!entry || entry.light === light) return
        entry.light = light
        refresh()
      },
      setFocused: (id, focused) => {
        const entry = entries.current.get(id)
        if (!entry || entry.focused === focused) return
        entry.focused = focused
        // Le passage à « affiché » est l'événement qui date l'écran ; le passage à « caché » ne
        // date rien.
        showIfFocused(entry)
        refresh()
      },
      // S3 : un écran caché ne change pas la lumière ; son geste est ignoré, pas mis de côté.
      setSource: (id, source) => {
        const entry = entries.current.get(id)
        if (!entry?.focused || sameSource(entry.source, source)) return
        entry.source = source
        refresh()
      },
      // S3 : seul l'écran dont la lumière est dessinée la ravive.
      pulse: (id, force) => {
        if (drawnId.current === id) pulseLight(force)
      },
    }
  }, [refresh, pulseLight])

  // Au montage, après les inscriptions des écrans (leurs effets passent avant celui de l'hôte) :
  // sans aucun écran inscrit, aucune lumière.
  useLayoutEffect(() => {
    refresh()
  }, [refresh])

  const state = useMemo(
    () => ({ source: drawn.source, lit: drawn.lit, onPulse }),
    [drawn.source, drawn.lit, onPulse],
  )
  return (
    <AmbientRegistryContext.Provider value={registry}>
      <AmbientStateContext.Provider value={state}>{children}</AmbientStateContext.Provider>
    </AmbientRegistryContext.Provider>
  )
}

/** Hook : y a-t-il un hôte de la lumière autour de ce composant ? (même idée que useHasTabBarHost) */
export const useHasAmbientHost = (): boolean => useContext(AmbientRegistryContext) !== null

/** Ce qu'un écran dit de sa lumière en s'inscrivant. */
export type ScreenAmbientOptions = {
  /** L'écran veut-il une lumière ? Faux sur le miel (`brand`) et avec `ambient={false}`. */
  light: boolean
  /** Sa source au premier affichage (le visuel déjà connu), sinon `null` (la lumière miel). */
  initialSource?: AmbientSource
  /** L'écran est-il affiché ? (`useScreenFocused()`, ui/screenFocus.ts) */
  focused: boolean
}

/**
 * Hook : inscrit l'écran auprès de l'hôte, le temps de sa vie, et rend ses gestes **liés à son
 * inscription** : `setSource` change la source de cet écran-là (ignoré tant qu'il est caché),
 * `pulse` ravive la lumière commune seulement si c'est la sienne qui est dessinée. Hors de l'hôte,
 * rend `null` et n'inscrit rien.
 */
export function useAmbientRegistration({
  light,
  initialSource = null,
  focused,
}: ScreenAmbientOptions): Ambient | null {
  const registry = useContext(AmbientRegistryContext)
  // useId : une identité stable, propre à cet écran, pour le registre.
  const id = useId()
  // Ce que l'inscription envoie : une ref, lue par l'effet d'inscription sans en être une
  // dépendance (sinon chaque changement désinscrirait puis réinscrirait l'écran). Les deux effets
  // suivants la tiennent à jour.
  const latest = useRef({ light, source: initialSource, focused })

  // useLayoutEffect : avant que le navigateur ne peigne, pour que la lumière de la page qui arrive
  // parte dès sa première image. L'effet renvoie le désabonnement, joué au démontage (S3).
  useLayoutEffect(() => {
    if (!registry) return
    registry.add(id, latest.current)
    return () => registry.remove(id)
  }, [registry, id])

  useLayoutEffect(() => {
    latest.current.light = light
    registry?.setLight(id, light)
  }, [registry, id, light])

  useLayoutEffect(() => {
    latest.current.focused = focused
    registry?.setFocused(id, focused)
  }, [registry, id, focused])

  return useMemo(
    () =>
      registry
        ? {
            setSource: (source: AmbientSource) => registry.setSource(id, source),
            pulse: (force?: number) => registry.pulse(id, force),
          }
        : null,
    [registry, id],
  )
}

/**
 * La lumière d'un écran, que `ui/Screen.tsx` pose autour de son contenu : dans l'hôte, il s'y
 * inscrit et donne à ses enfants des gestes liés à son inscription (useAmbient()) ; hors de
 * l'hôte, il monte son propre fournisseur, comme avant (l'écran pose alors sa propre
 * `AmbientLight`, voir useHasAmbientHost).
 */
export function ScreenAmbient({
  children,
  ...options
}: ScreenAmbientOptions & { children: ReactNode }) {
  const actions = useAmbientRegistration(options)
  if (actions === null) {
    return <AmbientProvider initialSource={options.initialSource}>{children}</AmbientProvider>
  }
  return <AmbientActions.Provider value={actions}>{children}</AmbientActions.Provider>
}

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
