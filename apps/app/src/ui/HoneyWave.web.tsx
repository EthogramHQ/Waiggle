// Le dessin de la vague de miel, sur le web (R17, scénario « La vague de miel à l'entrée ») : un
// `<svg>` de la taille de la fenêtre, dont le tracé change à chaque image. Même forme et mêmes
// couleurs que sur téléphone (ui/HoneyWave.tsx) : la forme vient de ui/wavePath.ts ; l'hôte
// (ui/HoneyWaveHost.tsx) la pose au-dessus de tout et décide quand la page change.
//
// `requestAnimationFrame(f)` demande au navigateur d'appeler `f` juste avant de peindre la
// prochaine image (60 fois par seconde environ), avec l'heure de cette image : la boucle s'y
// réinscrit tant que la vague n'est pas finie. Le tracé est posé directement sur l'élément
// (`setAttribute`), sans redessiner React à chaque image.
import { durations } from '@ruche/brand'
import { useEffect, useRef, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { useTheme } from './theme/ThemeProvider'
import { type HoneyWaveProps, wavePath } from './wavePath'

// L'identifiant du dégradé, que le tracé cite (`url(#…)`). Une seule vague joue à la fois ; les
// images figées du catalogue ont chacune le leur.
const GRADIENT = 'honey-wave-fill'

export function HoneyWave({ originY, at, width: givenWidth, height: givenHeight }: HoneyWaveProps) {
  const window = useWindowDimensions()
  const width = givenWidth ?? window.width
  const height = givenHeight ?? window.height
  const { colors } = useTheme()
  const gradient = at === undefined ? GRADIENT : `${GRADIENT}-${Math.round(at * 100)}`
  const path = useRef<SVGPathElement | null>(null)
  // Le point de départ, lu par la boucle à chaque image : la mesure du bouton peut arriver pendant
  // que la vague monte déjà.
  const origin = useRef(originY ?? height)
  origin.current = originY ?? height
  // Le tracé du premier affichage, gardé tel quel : la mesure du bouton qui arrive redessine le
  // composant, et un tracé recalculé ici ramènerait la vague à son départ le temps d'une image.
  const [first] = useState(() => wavePath(0, width, height, { y: originY ?? height }))

  useEffect(() => {
    // Une image figée (le catalogue) ne tourne pas.
    if (at !== undefined) return
    let frame = 0
    let start: number | null = null
    const draw = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / durations.wave)
      path.current?.setAttribute('d', wavePath(t, width, height, { y: origin.current }))
      if (t < 1) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    // Au démontage (l'hôte retire la vague), la boucle s'arrête.
    return () => cancelAnimationFrame(frame)
  }, [at, width, height])

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      // Un décor : l'hôte rend déjà sa couche muette ; le dessin lui-même ne se lit pas non plus.
      aria-hidden
      focusable={false}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Le dégradé du haut vers le bas : le pollen au bord avant, le miel, l'ambre au fond. */}
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.honeyLight} />
          <stop offset="0.3" stopColor={colors.honey} />
          <stop offset="1" stopColor={colors.amber} />
        </linearGradient>
      </defs>
      <path
        ref={path}
        fill={`url(#${gradient})`}
        d={at === undefined ? first : wavePath(at, width, height, { y: originY ?? height })}
      />
    </svg>
  )
}
